import Workspace from './Workspace';
import React from "react";
import Master from "./webrtc/master";

export default class MasterWorkspace extends Workspace {

    get controller() {
        return new Master(this.state.Config);
    }

    render() {
        return (
            <div>
                <h2>Master</h2>
                <div>
                    <h5>Master Section</h5>
                    <div>
                        ${super.localView}
                    </div>
                </div>
                <div>
                    <h5>Viewer Return Channel</h5>
                    <div>
                        ${super.remoteView}
                    </div>
                </div>
            </div>
        );
    }
}