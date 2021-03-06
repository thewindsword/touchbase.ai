import koa from "koa";
import { Server } from "onefx";
import { logger } from "onefx/lib/integrated-gateways/logger";
import { MyServer } from "../../server/start-server";
import { MyContext } from "../../types/global";
import {
  allowedLoginNext,
  allowedLogoutNext,
  AuthConfig,
  authConfig
} from "./auth-config";
import { Mailgun } from "./mailgun";
import { EmailTokenModel } from "./model/email-token-model";
import { JwtModel } from "./model/jwt-model";
import { UserModel } from "./model/user-model";
import { template } from "./template";
import { getExpireEpochDays } from "./utils/expire-epoch";

export class OnefxAuth {
  public config: AuthConfig;

  public server: Server;

  public user: UserModel;

  public jwt: JwtModel;

  public emailToken: EmailTokenModel;

  public mailgun: Mailgun;

  constructor(server: MyServer, config: AuthConfig) {
    this.config = config || authConfig;
    this.server = server;
    const { mongoose } = server.gateways;
    this.user = new UserModel({ mongoose });
    this.jwt = new JwtModel({
      mongoose,
      secret: this.config.secret,
      expDays: this.config.ttl
    });
    this.emailToken = new EmailTokenModel({
      mongoose,
      expMins: config.emailTokenTtl
    });
    this.mailgun = new Mailgun(config.mailgun);
    this.config.cookieOpts = {
      ...this.config.cookieOpts,
      expires: new Date(getExpireEpochDays(this.config.ttl))
    };
  }

  public async sendResetPasswordLink(
    userId: string,
    email: string,
    t: (a: string) => string,
    origin: string
  ): Promise<void> {
    const { token } = await this.emailToken.newAndSave(userId);
    const link = `${origin}${this.config.emailTokenLink}${token}`;
    logger.debug(`sending out password reset email ${link}`);

    const emailContent = template({
      brand: t("meta.title"),
      origin,
      logoSrc: `${origin}/favicon.png`,
      forgotPasswordText: t("auth/forgot_password"),
      forgotPasswordDes: t("auth/forgot_password.email_content"),
      forgotPasswordBtnText: t("auth/forgot_password.email_cta"),
      forgotPasswordBtnLink: link
    });

    await this.mailgun.sendMail({
      from: `"${t("meta.title")}" <noreply@${this.config.mailgun.domain}>`,
      to: email,
      subject: t("auth/forgot_password.email_title"),
      html: emailContent
    });
  }

  public authRequired = async (
    ctx: MyContext,
    next: koa.Next
  ): Promise<void> => {
    await this.authOptionalContinue(ctx, async () => undefined);
    const { userId } = ctx.state;
    if (!userId) {
      logger.debug("user is not authenticated but auth is required");
      ctx.redirect(
        `${this.config.loginUrl}?next=${encodeURIComponent(ctx.url)}`
      );
      return;
    }

    logger.debug(`user is authenticated ${userId}`);
    await next();
  };

  public authOptionalContinue = async (
    ctx: MyContext,
    next: koa.Next
  ): Promise<void> => {
    const token = this.tokenFromCtx(ctx);
    if (!token) {
      next();
      return;
    }

    ctx.state.userId = await this.jwt.verify(token);
    ctx.state.jwt = token;
    await next();
  };

  public logout = async (ctx: MyContext): Promise<void> => {
    ctx.cookies.set(this.config.cookieName, "", this.config.cookieOpts);
    const token = this.tokenFromCtx(ctx);
    if (token) {
      await this.jwt.revoke(token);
    }
    ctx.redirect(allowedLogoutNext(ctx.query.next));
  };

  public postAuthentication = async (ctx: MyContext): Promise<void> => {
    if (!ctx.state.userId) {
      return;
    }

    logger.debug(`user ${ctx.state.userId} is in post authentication status`);

    const token = await this.jwt.create(ctx.state.userId);
    ctx.cookies.set(this.config.cookieName, token, this.config.cookieOpts);
    ctx.state.jwt = token;
    const nextUrl = allowedLoginNext(
      ctx.query.next || (ctx.request.body && ctx.request.body.next)
    );
    if (ctx.is("json")) {
      const { isMobileWebView } = ctx.session;
      ctx.body = {
        shouldRedirect: true,
        ok: true,
        next: nextUrl,
        authToken: isMobileWebView ? token : null
      };
      return;
    }
    ctx.redirect(nextUrl);
  };

  public tokenFromCtx = (ctx: koa.Context): string | undefined => {
    let token = ctx.headers.authorization;
    if (token) {
      token = String(ctx.headers.authorization).replace("Bearer ", "");
    } else {
      token = ctx.cookies.get(this.config.cookieName, this.config.cookieOpts);
    }
    return token;
  };
}
