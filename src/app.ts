import { Request, ResponseToolkit, Server } from "hapi";
import { isEmpty } from "lodash";
import { Statement } from "sqlite3";
import Boom = require("boom");
import { config } from "node-config-ts";

const Joi = require("joi");
const sqlite3 = require("sqlite3").verbose();
const db = new sqlite3.Database(config.sqlliteFilePath);

const CLIENT_ID = "172433576772-crg5vtfavpqsbn4mitk7ffl2s73o93fc.apps.googleusercontent.com";


export const server: Server = new Server({
    port: 3000,
    host: "localhost",
    routes: {
        cors: {
            origin: ["*"],
            additionalHeaders: ["cache-control", "x-requested-with"]
        }
    }
});

server.auth.scheme("google", (server: Server) => {
    return {
        async authenticate(request: Request, h: ResponseToolkit) {
            if (!isEmpty(request.yar.get("u"))) {
                return h.authenticated({credentials: {user: request.yar.get("u")}});
            }
            const authorization = request.headers.authorization;
            if (!authorization) {
                throw Boom.unauthorized();
            }
            const payload = await verify(authorization)
                .catch((err) => {
                    throw Boom.unauthorized(err);
                });
            request.yar.set("u", payload["email"]);
            return h.authenticated({credentials: {user: request.yar.get("u")}});
        }

    };
});
server.auth.strategy("google", "google");
server.auth.default("google");


server.route({
    method: "GET",
    path: "/",
    handler: (request, h) => {
        return h.response({ok: true});
    }
});

server.route({
    method: "GET",
    path: "/stats",
    handler: (request, h) => {
        db.all("SELECT * from STATS, SADHANA where STATS.EMAIL = ? AND SADHANA.ROWID = STATS.SADHANA_ID", [request.auth.credentials.user], (_: Statement, err: any, rows: any[]) => {
            if (err) {
                throw Boom.internal(err);
            }
            h.response(rows);
        });
    }
});

server.route({
    method: "POST",
    path: "/stats",
    options: {
        validate: {
            payload: Joi.object().keys({
                sadhanaId: Joi.string().required().minLength(1)
            })
        }
    },
    handler: (request, h) => {
        const stmt = db.prepare("INSERT INTO STATS (EMAIL, SADHANA_ID) VALUES(?, ?)");
        stmt.run([request.auth.credentials.user]);
        stmt.finalize((err: any) => {
            if (err) {
                throw Boom.internal(err);
            }
            h.response({ok: true});
        });
    }
});
const init = async () => {
    return server.register({
        plugin: require("yar"),
        options: {
            expiresIn: 5 * 60,
            storeBlank: false,
            cookieOptions: {
                isSameSite: "Strict",
                password: process.env["SECURE_COOKIE_HASH"] || "af05778a5c5039afd28dc0d353158fc932cf79ecf6a3afd1ec657f03aa18f2cf",
                isSecure: true,
                isHttpOnly: true,
                maxCookieSize: 3 * 1048
            }
        }
    }).then(() => {
        return server.start();
    }).then(() => {
        console.log(`Server running at: ${server.info.uri}`);
    });
};

const {OAuth2Client} = require("google-auth-library");
const client = new OAuth2Client(CLIENT_ID);

async function verify(token: string) {
    const ticket = await client.verifyIdToken({
        idToken: token,
        audience: CLIENT_ID
    });
    return ticket.getPayload();
}

process.on("unhandledRejection", (err) => {
    console.log(err);
    process.exit(1);
});

db.serialize(function () {
    db.run("CREATE TABLE SADHANA (NAME TEXT NOT NULL, DESCRIPTION TEXT DEFAULT NULL, POINTS NUMERIC  NOT NULL)");
    db.run(`
        CREATE TABLE STATS (
          EMAIL TEXT NOT NULL,
          SADHANA_ID INTEGER NOT NULL FOREIGN KEY REFERENCES SADHANA(ROW_ID),
          DATE TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )`.trim());
});

init();