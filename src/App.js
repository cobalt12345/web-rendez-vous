import './App.css';
import MasterWorkspace from './MasterWorkspace';
import ViewerWorkspace from './ViewerWorkspace';
import {Auth} from "aws-amplify";
import LOG from './Logger';
import React from "react";
import { Switch, Paper } from '@mui/material';
import adapter from 'webrtc-adapter';
import MasterOrViewerDialog from "./webrtc/masterOrViewerDialog";

class App extends React.Component {
    constructor(props) {
        super(props);
        const {signOut} = props;
        this.state = {signOut, isMaster: true, workspaceStarted: false};
        this.masterOrViewerChoice = this.masterOrViewerChoice.bind(this);
        this.handleWorkspaceStartStop = this.handleWorkspaceStartStop.bind(this);
        LOG.debug('App props:', props);
        Auth.currentCredentials().then(currentUserCredentials =>
        {
            LOG.debug('Current user credentials:', currentUserCredentials);
            this.setState({currentUserCredentials});
        });
    }

    componentDidMount() {
        LOG.info(`Browser: ${adapter.browserDetails.browser} Version: ${adapter.browserDetails.version}`);
    }

    masterOrViewerChoice() {
        this.setState(prevState => {
            return {
                ...prevState,
                isMaster: !prevState.isMaster
            }
        });
    }

    handleWorkspaceStartStop(started) {
        this.setState({workspaceStarted: started});
    }

    render() {
        LOG.debug('Render App');

        let workspace;
        if (this.state.isMaster) {
            workspace = <MasterWorkspace currentUserCredentials={this.state.currentUserCredentials}
                                         signOut={this.state.signOut} started={this.handleWorkspaceStartStop}/>;
        } else {
            workspace = <ViewerWorkspace currentUserCredentials={this.state.currentUserCredentials}
                                         signOut={this.state.signOut} started={this.handleWorkspaceStartStop}/>
        }

        return (
            <div className="App">
                <MasterOrViewerDialog />
                <Paper variant='outlined'>
                    <h1 id='WorkspaceHeader'>
                        {this.state.isMaster ? 'Master Workspace' : 'Viewer Workspace'}
                    </h1>
                    <Switch onChange={this.masterOrViewerChoice} disabled={this.state.workspaceStarted}/>
                    {workspace}
                </Paper>
            </div>
        );
    }
}

export default App;

async function debugAuthContext() {
    try {
        const accessToken = (await Auth.currentSession()).getAccessToken();
        LOG.debug('Access token: ', accessToken);
    } catch(error) {
        LOG.warn('Get access token error', error);
    }
    try {
        const currentSession = await Auth.currentSession();
        LOG.debug('Current user session: ', currentSession);
    } catch(error) {
        LOG.warn('Get current session error', error);
    }
    try {
        const creds = (await Auth.currentCredentials());
        LOG.debug('Current credentials: ', creds);
    } catch(error) {
        LOG.warn('Get current credentials error', error);
    }
    try {
        const creds = (await Auth.currentUserCredentials());
        LOG.debug('Current user credentials: ', creds);
    } catch(error) {
        LOG.warn('Get current user credentials error', error);
    }
    try {
        const user = (await Auth.currentAuthenticatedUser());
        LOG.debug('Current authenticated user: ', user);
    } catch(error) {
        LOG.warn('Get current authenticated user error', error);
    }
}

