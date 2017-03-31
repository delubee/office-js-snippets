#!/usr/bin/env node --harmony

import * as path from 'path';
import * as chalk from 'chalk';
import { status } from './status';
import { rmRf, mkDir, getFiles, writeFile, banner, loadYamlFile } from './helpers';
import { startCase, groupBy, map } from 'lodash';
import { Dictionary } from '@microsoft/office-js-helpers';
import * as jsyaml from 'js-yaml';
import 'rxjs/add/operator/map';
import 'rxjs/add/operator/filter';

const { GH_ACCOUNT, GH_REPO, GH_BRANCH } = process.env;
const files = new Dictionary<File>();

(async () => {
    try {
        /* Creating playlists directory */
        status.add('Creating \'playlists\' folder');
        await rmRf('playlists');
        await mkDir('playlists');
        status.complete('Creating \'playlists\' folder');

        /* Loading samples */
        status.add('Loading snippets');
        let files$ = getFiles(path.resolve('samples'), path.resolve('samples'));
        status.complete('Loading snippets');

        files$.mergeMap(async (file) => {
            try {
                status.add(`Processing ${file.host}::${file.file_name}`);
                let { name, description, id } = await loadYamlFile<{ name: string, description: string, id: string }>(path.resolve('samples', file.path));
                // if (id == null || id.trim() === '') {
                //     throw new Error('Snippet ID cannot be empty');
                // }
                status.complete(`Processing ${file.host}::${file.file_name}`);
                return {
                    id,
                    name,
                    fileName: file.file_name,
                    description,
                    host: file.host,
                    gist: `https://raw.githubusercontent.com/${GH_ACCOUNT}/${GH_REPO}/${GH_BRANCH}/samples/${file.host}/${file.group}/${file.file_name}`,
                    group: startCase(file.group)
                };
            } catch (exception) {
                status.complete(`Processing ${file.host}::${file.file_name}`, exception);
                handleError(`Failed to process ${file.host}::${file.file_name}: ${exception.message || exception}`);
                return null;
            }
        })
            .filter((file) => !(file == null) && file.fileName !== 'default.yaml')
            .map((file) => files.add(file.gist, file))
            .subscribe(null, handleError, snippetsProcessed);
    }
    catch (exception) {
        handleError(exception);
    }
})();

/**
 * Generic error handler.
 * @param error Error object.
 */
function handleError(error?: any) {
    banner('An error has occured', error.message || error, chalk.bold.red);
    process.exit(1);
}

/**
 * Generating playlists
 */
async function snippetsProcessed() {
    if (files.count < 1) {
        return;
    }

    /* Generating playlists */
    status.add('Generating playlists');
    const groups = groupBy(files.values(), 'host');
    let promises = map(groups, async (items, host) => {
        let contents = jsyaml.safeDump(items);
        await writeFile(path.resolve(`playlists/${host}.yaml`), contents);
        banner(`Created ${host}.yaml`);
    });
    await Promise.all(promises);
    status.complete('Generating playlists');
}