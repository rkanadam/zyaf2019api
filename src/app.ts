import { Request, ResponseToolkit, Server } from "hapi";
import { each, isEmpty } from "lodash";
import { config } from "node-config-ts";
import Boom = require("boom");

const Joi = require("joi");
const sqlite3 = require("sqlite3").verbose();
const db = new sqlite3.Database(config.sqlliteFilePath);

const CLIENT_ID = "172433576772-crg5vtfavpqsbn4mitk7ffl2s73o93fc.apps.googleusercontent.com";

const sadhanas = require("../sadhana.json");

export const server: Server = new Server({
    port: 3000,
    host: "localhost",
    routes: {
        cors: {
            origin: ["*"],
            credentials: true
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
            request.yar.set("p", payload);
            return h.authenticated({credentials: {user: request.yar.get("u")}});
        }

    };
});
server.auth.strategy("google", "google");
server.auth.default("google");


server.route({
    method: "POST",
    path: "/login",
    options: {
        cors: true
    },
    handler: async (request, h) => {
        const payload = request.yar.get("p");
        const stmt = db.prepare("INSERT OR REPLACE INTO USERS (EMAIL, SIGNIN_PAYLOAD) VALUES(?, ?)");
        stmt.run([request.auth.credentials.user, JSON.stringify(payload)]);
        return new Promise((resolve, reject) => {
            stmt.finalize((err: any) => {
                if (err) {
                    throw Boom.internal(err);
                }
                resolve(h.response({ok: true}));
            });
        });
    }
});

server.route({
    method: "GET",
    path: "/my/sadhanas",
    handler: (request, h) => {
        return new Promise((resolve, reject) => {
            db.all("SELECT * from MY_SADHANAS, SADHANA where MY_SADHANAS.EMAIL = ? AND SADHANA.ROWID = MY_SADHANAS.SADHANA_ID ORDER BY SADHANA.NAME ASC", [request.auth.credentials.user], (err: any, rows: any[]) => {
                if (err) {
                    throw Boom.internal(err);
                }
                resolve(h.response(rows));
            });
        });
    }
});

server.route({
    method: "GET",
    path: "/sadhanas/top",
    handler: (request, h) => {
        return new Promise((resolve, reject) => {
            db.all(" SELECT SUM(SADHANA.POINTS) AS POINTS, USERS.* from STATS, MY_SADHANAS, SADHANA, USERS  WHERE STATS.EMAIL = MY_SADHANAS.EMAIL AND STATS.SADHANA_ID = MY_SADHANAS.SADHANA_ID AND SADHANA.ROWID = MY_SADHANAS.SADHANA_ID AND MY_SADHANAS.EMAIL = USERS.EMAIL GROUP BY MY_SADHANAS.EMAIL ORDER BY POINTS DESC LIMIT 10", (err: any, rows: any[]) => {
                if (err) {
                    throw Boom.internal(err);
                }
                resolve(h.response(rows));
            });
        });
    }
});

server.route({
    method: "GET",
    path: "/sadhanas",
    handler: (request, h) => {
        return new Promise((resolve, reject) => {
            db.all(" SELECT ST.*, SADHANA.ROWID AS 'ROWID', SADHANA.*, MY_SADHANAS.* FROM SADHANA LEFT OUTER JOIN MY_SADHANAS ON SADHANA.ROWID = MY_SADHANAS.SADHANA_ID AND MY_SADHANAS.EMAIL = ? LEFT OUTER JOIN (select STATS.EMAIL, COUNT(SADHANA_ID) AS COUNT, SADHANA_ID from STATS GROUP BY EMAIL, SADHANA_ID) ST ON ST.EMAIL = MY_SADHANAS.EMAIL AND ST.SADHANA_ID = MY_SADHANAS.SADHANA_ID ORDER BY MY_SADHANAS.EMAIL DESC, SADHANA.DESCRIPTION ASC",
                [request.auth.credentials.user], (err: any, rows: any[]) => {
                    if (err) {
                        throw Boom.internal(err);
                    }
                    resolve(h.response(rows));
                });
        });
    }
});


server.route({
    method: "POST",
    path: "/my/sadhanas/{sadhanaId}",
    options: {
        validate: {
            params: {
                sadhanaId: Joi.number().required()
            }
        }
    },
    handler: (request, h) => {
        const stmt = db.prepare(`INSERT INTO MY_SADHANAS (EMAIL, SADHANA_ID) VALUES(?, ?)`);
        stmt.run([request.auth.credentials.user, request.params.sadhanaId]);
        return new Promise((resolve, reject) => {
            stmt.finalize((err: any) => {
                if (err) {
                    throw Boom.internal(err);
                }
                resolve(h.response({ok: true}));
            });
        });
    }
});

server.route({
    method: "DELETE",
    path: "/my/sadhanas/{sadhanaId}",
    options: {
        validate: {
            params: Joi.object().keys({
                sadhanaId: Joi.string().required().min(1)
            })
        }
    },
    handler: (request, h) => {
        const stmt = db.prepare("DELETE FROM MY_SADHANAS WHERE EMAIL = ? AND SADHANA_ID = ?");
        stmt.run([request.auth.credentials.user, request.params.sadhanaId]);
        return new Promise((resolve, reject) => {
            stmt.finalize((err: any) => {
                if (err) {
                    throw Boom.internal(err);
                }
                h.response({ok: true});
                resolve(h.response({ok: true}));
            });
        });
    }
});


server.route({
    method: "POST",
    path: "/my/sadhanas/{sadhanaId}/performed",
    options: {
        validate: {
            params: {
                sadhanaId: Joi.number().required()
            }
        }
    },
    handler: (request, h) => {
        const stmt = db.prepare("INSERT INTO STATS (EMAIL, SADHANA_ID) VALUES(?, ?)");
        stmt.run([request.auth.credentials.user, request.params.sadhanaId]);
        return new Promise((resolve, reject) => {
            stmt.finalize((err: any) => {
                if (err) {
                    throw Boom.internal(err);
                }
                resolve(h.response({ok: true}));
            });
        });
    }
});


server.route({
    method: "GET",
    path: "/my/sadhanas/timeline",
    handler: (request, h) => {
        return new Promise((resolve, reject) => {
            db.all("SELECT * from STATS, SADHANA where STATS.EMAIL = ? AND SADHANA.ROWID = STATS.SADHANA_ID ORDER BY CREATED_AT DESC", [request.auth.credentials.user], (err: any, rows: any[]) => {
                if (err) {
                    throw Boom.internal(err);
                }
                resolve(h.response(rows));
            });
        });
    }
});

server.route({
    method: "GET",
    path: "/my/sadhanas/stats",
    handler: (request, h) => {
        return new Promise((resolve, reject) => {
            db.all("select SUM(SD.points) AS SUM, SD.*, M.SADHANA_ID from MY_SADHANAS M  left join STATS S ON M.SADHANA_ID = S.SADHANA_ID LEFT JOIN SADHANA SD ON SD.ROWID = M.SADHANA_ID WHERE M.EMAIL = ? GROUP BY M.SADHANA_ID ORDER BY M.SADHANA_ID ASC", [request.auth.credentials.user], (err: any, rows: any[]) => {
                if (err) {
                    throw Boom.internal(err);
                }
                resolve(h.response(rows));
            });
        });
    }
});


const init = async () => {
    return new Promise((resolve, reject) => {
        db.serialize(() => {
                db.run(`
                    CREATE TABLE IF NOT EXISTS SADHANA (
                      NAME TEXT NOT NULL PRIMARY KEY,
                      DESCRIPTION TEXT DEFAULT NULL,
                      POINTS NUMERIC  NOT NULL,
                      HREF TEXT DEFAULT NULL,
                      CATEGORY TEXT NOT NULL
                    )`.trim());
                db.run(`
                    CREATE TABLE  IF NOT EXISTS MY_SADHANAS (
                      EMAIL TEXT NOT NULL,
                      SADHANA_ID INTEGER NOT NULL, FOREIGN KEY (SADHANA_ID) REFERENCES SADHANA(ROWID)
                    )`.trim());
                db.run(`
                    CREATE TABLE  IF NOT EXISTS STATS (
                      EMAIL TEXT NOT NULL,
                      CREATED_AT TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
                      SADHANA_ID INTEGER NOT NULL, FOREIGN KEY (SADHANA_ID) REFERENCES SADHANA(ROWID)
                    )`.trim());
                db.run(`
                    CREATE TABLE  IF NOT EXISTS USERS (
                      EMAIL TEXT NOT NULL PRIMARY KEY,
                      CREATED_AT TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
                      SIGNIN_PAYLOAD TEXT NOT NULL
                    )`.trim());

                db.run("BEGIN TRANSACTION");
                const stmt = db.prepare("INSERT OR REPLACE INTO SADHANA (ROWID, NAME, DESCRIPTION, POINTS, HREF, CATEGORY) VALUES(?, ?, ?, ?, ?, ?)");
                each(sadhanas, (values, category) => {
                    each(values, (sadhana) => {
                        stmt.run([sadhana.rowid, sadhana.text, sadhana.text, sadhana.points, sadhana.text, category]);
                    });
                });
                db.run("COMMIT");
                resolve(true);
            }
        );
    }).then(() => {
        return server.register({
            plugin: require("yar"),
            options: {
                expiresIn: 5 * 60,
                storeBlank: false,
                cookieOptions: {
                    isSameSite: false,
                    password: process.env["SECURE_COOKIE_HASH"] || "af05778a5c5039afd28dc0d353158fc932cf79ecf6a3afd1ec657f03aa18f2cf",
                    isSecure: process.env.NODE_ENV !== "development",
                    isHttpOnly: true
                }
            }
        });
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

init();