import Workspace from './Workspace';
import React from "react";
import Master from "./webrtc/master";
import LOG from './Logger';

export default class MasterWorkspace extends Workspace {

    get controller() {
        return new Master(this.state.Config);
    }

    getLocalViewId() {
        return "masterLocalView";
    }

    getRemoteViewId() {
        return "masterRemoteView";
    }

    render() {
        LOG.debug("Render MasterWorkspace with props:", this.props);
        return (
            <div id='MasterWorkspace'>
                {super.render()}
            </div>
        );
    }
}