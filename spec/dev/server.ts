import { ApolloServer } from 'apollo-server';
import bodyParser from 'body-parser';
import cors from 'cors';
import express from 'express';
import * as path from 'path';
import { ArangoDBAdapter } from '../..';
import { globalContext } from '../../src/config/global';
import { InMemoryAdapter } from '../../src/database/inmemory';
import { getMetaSchema } from '../../src/meta-schema/meta-schema';
import { Model } from '../../src/model';
import { loadProjectFromDir } from '../../src/project/project-from-fs';
import { Log4jsLoggerProvider } from '../helpers/log4js-logger-provider';
import { createFastApp } from './fast-server';

const port = 3000;
const databaseName = 'cruddl';
const databaseURL = 'http://root:@localhost:8529';

// const databaseURL = 'http://root:@localhost:7050';

export async function start() {
    const loggerProvider = new Log4jsLoggerProvider('trace');

    let db;
    if (process.argv.includes('--db=in-memory')) {
        db = new InMemoryAdapter(undefined, { loggerProvider });
    } else {
        db = new ArangoDBAdapter(
            {
                databaseName,
                url: databaseURL,
                doNonMandatoryMigrations: true,
                createIndicesInBackground: true
            },
            { loggerProvider }
        );
    }

    const project = await loadProjectFromDir(path.resolve(__dirname, './model'), {
        profileConsumer: profile => {
            logger.info(
                `${profile.operation.operation} ${
                    profile.operation.name ? profile.operation.name.value : '<anonymous>'
                }: ${JSON.stringify(profile.timings, undefined, '  ')}`
            );
        },
        getOperationIdentifier: ({ context }) => context as object, // each operation is executed with an unique context object
        getExecutionOptions: ({ context }: { context: any }) => {
            return {
                authRoles: ['allusers', 'logistics-reader', 'system'],
                recordTimings: true,
                recordPlan: true,
                mutationMode: 'normal',

                //queryMemoryLimit: 1000000,
                cancellationToken: new Promise(resolve => context.req.on('aborted', resolve))
            };
        },
        /*processError(error: Error) {
            console.error(`Internal error: ${error.stack}`);
            return new Error(`Internal error`);
        },*/
        loggerProvider
    });
    const schema = project.createSchema(db);

    const logger = globalContext.loggerProvider.getLogger('server');
    logger.info('Making sure schema is up to date...');
    await db.updateSchema(project.getModel());
    logger.info('Schema is up to date');

    if (process.argv.includes('--run-ttl-cleanup')) {
        const result = await project.executeTTLCleanupExt(db, {
            timeToLiveOptions: { cleanupLimit: 100, reduceLimitOnResourceLimits: true }
        });
        for (const type of result.types) {
            if (type.error) {
                logger.info(`${type.type.rootEntityType?.name || ''}: ${type.error.stack}`);
            } else {
                logger.info(
                    `${type.type.rootEntityType?.name || ''}: ${type.deletedObjectsCount} / ${
                        type.deletedObjectsCount
                    }${type.hasReducedLimit ? ' (reduced)' : ''}${type.isComplete ? ' (complete)' : ''}`
                );
            }
        }
    }

    if (process.argv.includes('--print-ttl-info')) {
        logger.info(JSON.stringify(await project.getTTLInfo(db, {}), undefined, 2));
    }

    const server = new ApolloServer({
        schema: schema,
        context: props => props
    });

    const fastServer = express();
    fastServer.use(cors());
    fastServer.use(bodyParser.json());
    fastServer.post('/', createFastApp(project, db));
    fastServer.listen(3002);

    await server.listen({ port });
    logger.info(`Server started on http://localhost:${port}`);

    await startMetaServer(project.getModel());
}

let expressServerReference: any;

/**
 * starts an active GraphQL endpoint for testing and debugging the meta server API
 * @param {Model} model the meta schema model used for the endpoint
 * @returns {Promise<void>} returns promise so that Mocha will wait till server was started
 */
export async function startMetaServer(model: Model) {
    const logger = globalContext.loggerProvider.getLogger('server');

    const metaSchemaPort = port + 1;
    const metaSchemaServer = new ApolloServer({
        schema: getMetaSchema(model),
        context: { locale: 'en' }
    });
    expressServerReference = await metaSchemaServer.listen({ port: metaSchemaPort });
    logger.info(`Meta-Schema-Server started on http://localhost:${metaSchemaPort}`);
}

/**
 * stops the active GraphQL endpoint at the end of debugging/testing
 * @returns {Promise<void>} used for graceful shutdown at the end of a test session.
 */
export async function stopMetaServer() {
    const logger = globalContext.loggerProvider.getLogger('server');
    if (expressServerReference && expressServerReference.close) {
        expressServerReference.close();
    }
    logger.info(`Meta-Schema-Server stopped`);
}
