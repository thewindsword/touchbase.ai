import AutoComplete from "antd/lib/auto-complete";
import Icon from "antd/lib/icon";
import Input from "antd/lib/input";
import gql from "graphql-tag";
import { t } from "onefx/lib/iso-i18n";
import React, { Component } from "react";
import { RouterProps, withRouter } from "react-router";
import { apolloClient } from "./apollo-client";

const { Option } = AutoComplete;

const SEARCH = gql`
  query search($name: String!) {
    search(name: $name) {
      name
      path
    }
  }
`;

let dblCtrlKey: any = 0;
const listenDoubleShift = cb => event => {
  if (dblCtrlKey !== 0 && event.key === "Shift") {
    cb();
  } else {
    dblCtrlKey = setTimeout(() => (dblCtrlKey = 0), 300);
  }
};

type ISearchResult = {
  name: string;
  path: string;
};

type State = {
  searchResult: Array<string>;
};

type Props = RouterProps;

export const SearchBox = withRouter(
  // @ts-ignore
  class SearchBoxInner extends Component<Props> {
    public state: State = {
      searchResult: []
    };

    private keyDownhandler: any;

    public handleSearch = async (inputText: string) => {
      const { data } = await apolloClient.query<{
        search: Array<ISearchResult>;
      }>({
        variables: {
          name: inputText
        },
        query: SEARCH
      });
      this.setState({ searchResult: data.search.map(s => s.path) });
    };

    public handleSelect = (value: any) => {
      this.props.history.push(value);
    };

    public inputRef: any;

    private readonly focus = () => {
      this.inputRef.focus();
    };

    public componentDidMount(): void {
      this.keyDownhandler = listenDoubleShift(this.focus);
      document.addEventListener("keydown", this.keyDownhandler);
    }

    public componentWillUnmount(): void {
      document.removeEventListener("keydown", this.keyDownhandler);
    }

    public render(): JSX.Element {
      const { searchResult } = this.state;
      const children = searchResult.map(email => (
        <Option key={email}>{email}</Option>
      ));
      return (
        <div
          className="certain-category-search-wrapper"
          style={{ width: 250, marginRight: "14px" }}
        >
          <AutoComplete
            className="certain-category-search"
            dropdownClassName="certain-category-search-dropdown"
            dropdownMatchSelectWidth={false}
            dropdownStyle={{ width: 300 }}
            size="large"
            style={{ width: "100%" }}
            dataSource={children}
            placeholder={t("topbar.search_everything")}
            onSearch={this.handleSearch}
            onSelect={this.handleSelect}
          >
            <Input
              ref={ref => (this.inputRef = ref)}
              suffix={<Icon type="search" className="certain-category-icon" />}
            />
          </AutoComplete>
        </div>
      );
    }
  }
);
