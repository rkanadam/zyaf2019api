import { Request, ResponseToolkit, Server } from 'hapi';
import Boom = require('boom');

const CLIENT_ID = '172433576772-crg5vtfavpqsbn4mitk7ffl2s73o93fc.apps.googleusercontent.com';

export const server: Server = new Server({
    port: 3000,
    host: 'localhost',
    routes: {
        cors: {
            origin: ['*'],
            additionalHeaders: ['cache-control', 'x-requested-with']
        }
    }
});

server.auth.scheme('google', (server: Server) => {
    return {
        async authenticate(request: Request, h: ResponseToolkit) {
            const authorization = request.headers.authorization;
            if (!authorization) {
                throw Boom.unauthorized();
            }
            const payload = await verify(authorization)
                .catch((err) => {
                    throw Boom.unauthorized(err);
                });
            return h.authenticated({credentials: {user: payload['sub']}});
        }

    };
});
server.auth.strategy('google', 'google');
server.auth.default('google');


server.route({
    method: 'GET',
    path: '/',
    handler: (request, h) => {

        return 'Hello, world!';
    }
});

server.route({
    method: 'GET',
    path: '/{name}',
    handler: (request, h) => {

        return 'Hello, ' + encodeURIComponent(request.params.name) + '!';
    }
});

const init = async () => {

    await server.start();
    console.log(`Server running at: ${server.info.uri}`);
};

const {OAuth2Client} = require('google-auth-library');
const client = new OAuth2Client(CLIENT_ID);

async function verify(token: string) {
    const ticket = await client.verifyIdToken({
        idToken: token,
        audience: CLIENT_ID
    });
    return ticket.getPayload();
}

process.on('unhandledRejection', (err) => {

    console.log(err);
    process.exit(1);
});

init();