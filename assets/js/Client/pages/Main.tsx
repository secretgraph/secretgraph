import * as React from "react";
import { graphql, QueryRenderer } from "react-relay";
import { environment } from "../environment";
import ActionBar from "../components/ActionBar";
import HeaderBar from "../components/HeaderBar";
import SideBar from "../components/SideBar";
import { themeComponent } from "../theme";
import { Theme } from "@material-ui/core/styles";

type Props = {
  classes: any,
  theme: Theme
};

export default themeComponent((props: Props) => {
  const {classes, theme} = props;
  const [drawerOpen, setDrawerOpen] = React.useState(true);
  return (
    <div className={classes.root}>
      <HeaderBar open={drawerOpen} title={"sdldslkksd"} setDrawerOpen={setDrawerOpen} />
      <SideBar
        sidebarHandler=""
        open={drawerOpen}
        setDrawerOpen={setDrawerOpen}
      />
      <main className={drawerOpen ? classes.contentShift : classes.content}>
        <ActionBar buttonHandler=""/>
        <section className={classes.mainSection}>
        </section>
      </main>
    </div>
  );
});
/**

export class App extends React.Component {
  render() {
    return (
      <QueryRenderer
        environment={environment}
        query={graphql`
          query MainAppQuery {
            secretgraphConfig {
              requireServersideEncryption
            }
          }
        `}
        variables={{}}
        render={({ error, props }) => {
          if (error) {
            return <div>Error!</div>;
          }
          if (!props) {
            return <div>Loading...</div>;
          }
          return (
            <div>
              User ID: {props.requireServersideEncryption ? "true" : "false"}
            </div>
          );
        }}
      />
    );
  }
}
 */
