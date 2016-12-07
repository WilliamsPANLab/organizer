'use strict';
const angular = require('angular');

const app = angular.module('app');

const fs = require('fs');
const path = require('path');
const zlib = require('zlib');
const Rx = require('rx');
const {dirListObs} = require('../common/util.js');
const dicomParser = require('dicom-parser');
const TAG_DICT = require('../common/dataDictionary.js').TAG_DICT;
const crypto = require('crypto');
const engage = require('../common/engage');
const filetypes = require('../common/filetypes.json');

const extToScitranType = {};
for (const type of Object.keys(filetypes)) {
  for (const ext of filetypes[type]) {
    extToScitranType[ext] = type;
  }
}

const decompressForExt = {
  '.gz': function gunzip(buffer) {
    return zlib.gunzipSync(buffer);
  }
};

function dicom($rootScope, organizerStore, fileSystemQueues) {

  const parseFileHeaders = (buffer) => {
    return convertHeaderToObject(dicomParser.parseDicom(buffer));
  };

  const parseFile = (filePath) => {
    return fileSystemQueues.append({
      operation: 'read',
      path: filePath
    }).then(
      function(buffer) {
        let ext = path.extname(filePath);
        // we compute hash before unzipping because that's what we will upload.
        const hash = 'v0-sha384-' + crypto.createHash('sha384').update(buffer).digest('hex');
        if (decompressForExt[ext]) {
          buffer = decompressForExt[ext](buffer);
          // now let's see what's after the compression extension
          ext = path.extname(filePath.slice(0, filePath.length - ext.length));
        }
        const size = buffer.length * buffer.BYTES_PER_ELEMENT;
        const header = engage.wrapParseFileHeaders(parseFileHeaders, organizerStore)(buffer, filePath, ext);
        const type = extToScitranType[ext] || extToScitranType['.dcm'];
        const acquisition = organizerStore.get().fileHashToAcquisition[hash];
        let uploadStatus;
        if (acquisition) {
          uploadStatus = (
            acquisition.uid === header.SeriesInstanceUID &&
            acquisition.label === header.SeriesDescription &&
            acquisition.session.uid === header.StudyInstanceUID
          ) ? 'previously-uploaded' : 'server-and-file-header-mismatch';
        } else {
          uploadStatus = 'needs-upload';
        }
        return {
          path: filePath,
          contentExt: ext,
          content: buffer,
          uploadStatus,
          size,
          hash,
          type,
          header
        };
      }
    );
  };

  const getTag = (key) => {
    const group = key.substring(1,5);
    const element = key.substring(5,9);
    const tagIndex = ('(' + group + ',' + element + ')').toUpperCase();
    return TAG_DICT[tagIndex];
  };

  const dicomDump = (filePath) => {
    const header = parseFile(filePath).header;
    let dump = [];
    for (let key of Object.keys(header)) {
      dump.push(`${key}: ${header[key]}`);
    }
    return dump;
  };

  const convertHeaderToObject = (header) => {
    let m = Object.create(null);
    for (let key of Object.keys(header.elements)) {
      let tag = getTag(key);
      let value = header.string(key);
      if (tag) {
        m[tag.name] = value;
      } else {
        m[key] = value;
      }
    }
    return m;
  };

  const sortDicoms = function(path) {
    const subject = new Rx.Subject();
    try {
      fs.accessSync(path);
    } catch (exc) {
      subject.onError(path + ' is not accessible on the filesystem.');
    }
    const obsFiles$ = dirListObs(path);
    obsFiles$.toArray().subscribe(function(files){
      const errors = files.filter(file => file.err);
      const nonerrors = files.filter(file => !file.err);
      const start = Date.now();
      const increment = 100.0 / nonerrors.length;
      const progress = organizerStore.get().progress;
      const parsed = [];

      engage.setFiles(nonerrors);
      Promise.all(nonerrors.map(function(file) {
        const p = engage.wrapParseFile(parseFile)(file.path).catch(function(err) {
          return {
            path: file.path,
            err: err
          };
        });
        p.then(function() {
          // this runs in both success and error
          progress.state += increment;
          $rootScope.$apply();
        });
        return p;
      })).then(function(results) {
        for (const result of results) {
          if (result.err){
            errors.push(result);
          } else {
            parsed.push(result);
          }
        }
        subject.onNext({message: `Processed ${parsed.length} files in ${(Date.now() - start)/1000} seconds`});
        if (errors.length) {
          subject.onNext({errors: errors});
        }
        console.log(parsed.length);
        subject.onNext(parsed);
        subject.onCompleted();
      }, function(err) {
        subject.onError(err);
        console.log('Error: ' + err);
      }).then(function() {
        // this runs in both success and error
        progress.state = 0;
        $rootScope.$apply();
      });
    });

    return subject;
  };

  return {
    dicomDump: dicomDump,
    sortDicoms: sortDicoms
  };
}

dicom.$inject = ['$rootScope', 'organizerStore', 'fileSystemQueues'];
app.factory('dicom', dicom);
exports.factory = dicom;
