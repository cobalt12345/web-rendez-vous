import Workspace from './Workspace';
import React from "react";
import Viewer from "./webrtc/viewer";
import LOG from "./Logger";
import { Grid } from '@mui/material';

export default class ViewerWorkspace extends Workspace {

    constructor(props) {
        super(props);
    }

    get controller() {
        const Config = {...this.state.Config, clientId: this.getRandomClientId()}
        return new Viewer(Config);
    }

    getLocalViewId() {
        return "viewerLocalView";
    }

    getRemoteViewId() {
        return "viewerRemoteView";
    }

    getRandomClientId() {
        return Math.random()
            .toString(36)
            .substring(2)
            .toUpperCase();
    }

    render() {
        LOG.debug("Render MasterWorkspace with props:", this.props);
        super.render();
        return (
            <Grid container spacing={2}>
                <Grid item xs={6} lg={6}>
                    <h5>Local Stream View</h5>
                    {this.localView}
                </Grid>
                <Grid item xs={6} lg={6}>
                    <h5>Remote Stream View</h5>
                    {this.remoteView}
                </Grid>
            </Grid>
        );
    }
}