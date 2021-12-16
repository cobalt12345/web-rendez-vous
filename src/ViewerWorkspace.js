import Workspace from './Workspace';
import React from "react";
import Viewer from "./webrtc/viewer";

export default class ViewerWorkspace extends Workspace {

    get controller() {
        return new Viewer(this.state.Config);
    }

    render() {
        return (
            <div>
                <h2>Viewer</h2>
                <div>
                    <h5>Return Channel</h5>
                    <div>
                        ${super.localView}
                    </div>
                </div>
                <div>
                    <h5>From Master</h5>
                    <div>
                        ${super.remoteView}
                    </div>
                </div>
            </div>
        );
    }
}