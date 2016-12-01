const archiver = require('archiver');
const {basename} = require('path');
const streamToBlob = require('stream-to-blob');

function createZipPromise(files) {
  const archive = archiver.create('zip', {});

  for (const file of files) {
    archive.file(file, {name: basename(file)});
  }

  archive.finalize();

  return new Promise(function(resolve, reject) {
    archive.on('error', reject);

    streamToBlob(archive, function(err, blob) {
      if (err) {
        reject(err);
      } else {
        resolve(blob);
      }
    });
  });
}

exports.createZipPromise = createZipPromise;
