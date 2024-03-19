// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

/* eslint-disable no-console, consistent-return, no-process-env */

const fs = require('fs');
const path = require('path');

const {S3} = require('@aws-sdk/client-s3');
const {Upload} = require('@aws-sdk/lib-storage');
const async = require('async');
const mime = require('mime-types');
const readdir = require('recursive-readdir');

const {ARTIFACTS_DIR} = require('./constants');

require('dotenv').config();

const {
    BRANCH,
    BUILD_ID,
    COMMIT_HASH,
    DETOX_AWS_S3_BUCKET,
    DETOX_AWS_ACCESS_KEY_ID,
    DETOX_AWS_SECRET_ACCESS_KEY,
    IOS,
} = process.env;
const platform = IOS === 'true' ? 'ios' : 'android';

const s3 = new S3({
    credentials: {
        accessKeyId: DETOX_AWS_ACCESS_KEY_ID,
        secretAccessKey: DETOX_AWS_SECRET_ACCESS_KEY,
    },
});

function getFiles(dirPath) {
    return fs.existsSync(dirPath)
      ? readdir(dirPath).filter((file) => !file.endsWith('environment.json'))
      : [];
  }

async function saveArtifacts() {
    if (!DETOX_AWS_S3_BUCKET || !DETOX_AWS_ACCESS_KEY_ID || !DETOX_AWS_SECRET_ACCESS_KEY) {
        console.log('No AWS credentials found. Test artifacts not uploaded to S3.');

        return;
    }

    const s3Folder = `${BUILD_ID}-${COMMIT_HASH}-${BRANCH}`.replace(/\./g, '-');
    const uploadPath = path.resolve(__dirname, `../${ARTIFACTS_DIR}`);
    const filesToUpload = await getFiles(uploadPath);

    return new Promise((resolve, reject) => {
        async.eachOfLimit(
            filesToUpload,
            10,
            async.asyncify(async (file) => {
                const Key = file.replace(uploadPath, s3Folder);
                const contentType = mime.lookup(file);
                const charset = mime.charset(contentType);

                try {
                    await new Upload({
                        client: s3,
                        params: {
                            Key,
                            Bucket: DETOX_AWS_S3_BUCKET,
                            Body: fs.readFileSync(file),
                            ContentType: `${contentType}${charset ? '; charset=' + charset : ''}`,
                        },
                    }).done();
                    return {success: true};
                } catch (e) {
                    console.log('Failed to upload artifact:', file);
                    throw new Error(e);
                }
            }),
            (err) => {
                if (err) {
                    console.log('Failed to upload artifacts');
                    return reject(new Error(err));
                }

                const reportLink = `https://${DETOX_AWS_S3_BUCKET}.s3.amazonaws.com/${s3Folder}/jest-stare/${platform}-report.html`;
                resolve({success: true, reportLink});
            },
        );
    });
}

module.exports = {saveArtifacts};
