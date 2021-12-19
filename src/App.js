import './App.css';
import MasterWorkspace from './MasterWorkspace';
import ViewerWorkspace from './ViewerWorkspace';
import {Auth} from "aws-amplify";
import LOG from './Logger';
import React from "react";
import { Switch } from '@mui/material';

const checkForVideoAudioAccess = async () => {
    try {
        const cameraResult = await navigator.permissions.query({ name: 'camera' });
        LOG.info('Camera access: ', cameraResult.state);
        // The state property may be 'denied', 'prompt' and 'granted'
        // this.isCameraAccessGranted = cameraResult.state !== 'denied';

        const microphoneResult = await navigator.permissions.query({ name: 'microphone' });
        // this.isMicrophoneAccessGranted = microphoneResult.state !== 'denied';
        LOG.info('Micro access: ', microphoneResult.state);
    } catch(e) {
        console.error('An error occurred while checking the site permissions', e);
    }

    return true;
}

checkForVideoAudioAccess();

class App extends React.Component {
    constructor(props) {
        super(props);
        LOG.debug('App props:', props);
        Auth.currentCredentials().then(currentUserCredentials =>
        {
            LOG.debug('Current user credentials:', currentUserCredentials);
            this.setState({currentUserCredentials});
        });
        const {signOut} = props;
        this.state = {signOut, isMaster: false};
        this.masterOrViewerChoice = this.masterOrViewerChoice.bind(this);
    }

    componentDidMount() {

    }

    masterOrViewerChoice() {
        this.setState(prevState => {
            return {
                isMaster: !prevState.isMaster
            }
        });
    }

    render() {
        LOG.debug('Render App');

        let workspace;
        if (this.state.isMaster) {
            workspace = <MasterWorkspace currentUserCredentials={this.state.currentUserCredentials}/>;
        } else {
            workspace = <ViewerWorkspace currentUserCredentials={this.state.currentUserCredentials}/>
        }

        return (
            <div className="App">
                <header>
                    {this.state.isMaster ? 'Master Workspace' : 'Viewer Workspace'}
                </header>
                <Switch onChange={this.masterOrViewerChoice} />
                {workspace}
                <button onClick={this.state.signOut}>Sign out</button>
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

