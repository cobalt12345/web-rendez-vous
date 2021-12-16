import './App.css';
import MasterWorkspace from './MasterWorkspace';
import ViewerWorkspace from './ViewerWorkspace';
import {Hub, Auth} from "aws-amplify";
import LOG from './Logger';
import awsconfig from "./aws-exports";
import {fromCognitoIdentityPool} from "@aws-sdk/credential-providers";

const defaultCredentials = new fromCognitoIdentityPool(
    {
        identityPoolId: awsconfig.aws_cognito_identity_pool_id,
        clientConfig: { region: awsconfig.aws_project_region }
    }
);
LOG.debug('Default credentials', defaultCredentials);
Hub.listen('auth', data => LOG.debug('Auth. event', data));
Hub.listen('auth', data => {
    defaultCredentials.params.Logins = defaultCredentials.params.logins || {};
    if (data.payload.event === 'signIn') {
        if ('iss' in data.payload.data.signInUserSession.idToken.payload) {
            LOG.debug('Authentication via Cognito');
            defaultCredentials.params.Logins[data.payload.data.signInUserSession.idToken.payload.iss.slice('https://'.length - 1)]
                = data.payload.data.signInUserSession.idToken.jwtToken;
        }
        for (let provider of data.payload.data.signInUserSession.idToken.payload.identities) {
            if (provider.providerName === 'Google') {
                defaultCredentials.params.Logins['accounts.google.com'] =
                    data.payload.data.signInUserSession.idToken.jwtToken;
            }
        }
    }
});

function App() {
    (() => debugAuthContext())();

  return (
    <div className="App">
      <header>
        Test page
      </header>
        <MasterWorkspace />
    </div>
  );
}


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

export default App;
