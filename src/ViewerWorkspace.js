import Workspace from './Workspace';
import React from "react";
import Viewer from "./webrtc/viewer";
import LOG from "./Logger";


export default class ViewerWorkspace extends Workspace {

    constructor(props) {
        super(props);
    }

    get controller() {
        const Config = {...this.state.Config, clientId: this.getRandomClientId()}
        return new Viewer(Config);
    }

    getRandomClientId() {
        return Math.random()
            .toString(36)
            .substring(2)
            .toUpperCase();
    }

    render() {
        LOG.debug("Render ViewerWorkspace with props:", this.props);

        return (
            super.render()
        );
    }
}