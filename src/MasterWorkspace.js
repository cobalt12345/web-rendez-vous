import Workspace from './Workspace';
import React from "react";
import Master from "./webrtc/master";
import LOG from './Logger';
import { Grid } from '@mui/material';

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