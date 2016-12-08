'use strict';

const angular = require('angular');
const app = angular.module('app');
const path = require('path');
const {ipcPromiseCreator} = require('./common/ipc');

const openFileDialog = ipcPromiseCreator('open-file-dialog', 'selected-directory');

app.controller('loadCtrl', loadCtrl);

loadCtrl.$inject = ['$timeout', '$rootScope', 'steps', 'organizerStore', 'dicom', 'organizerUpload', 'config'];

function loadCtrl($timeout, $rootScope, steps, organizerStore, dicom, organizerUpload, config) {
  /*jshint validthis: true */
  const vm = this;
  vm.selectFolder = selectFolder;
  if (organizerStore.get().loaded.size){
    steps.complete();
  }
  function selectFolder() {
    const busy = organizerStore.get().busy;
    const success = organizerStore.get().success;
    const {uploadTarget} = organizerStore.get();
    openFileDialog(steps.current()).then(function(paths) {
      organizerStore.update({dicoms: [], errors: []});
      busy.state = true;
      busy.reason = 'Downloading latest from server...';
      $rootScope.$apply();
      const {groupName, projectLabel} = uploadTarget;
      const url = config.getItem('url');
      const apiKey = config.getItem('apiKey');
      if (!url || !apiKey) {
        if (!url) {
          config.setItem('url', '**add URL here**');
        }
        if (!apiKey) {
          config.setItem('apiKey', '');
        }
        busy.state = false;
        success.state = 'warning';
        success.reason = 'Missing url or API key.';
        $rootScope.$apply();
        throw new Error('Missing url or API key.');
      }
      return organizerUpload.loadAcquisitions(url, apiKey, groupName, projectLabel).then(function(acquisitions) {
        organizerStore.update({ acquisitions, detectedProjectLabel: projectLabel })
        return paths;
      });
    }).then(function(paths) {
      organizerStore.update({dicoms: [], errors: []});
      busy.reason = 'Loading data...';
      $rootScope.$apply();
      const subject = dicom.sortDicoms(paths[0]);
      subject.subscribe(
        (dicomsOrMessage) => {
          if (dicomsOrMessage.message !== undefined){
            organizerStore.update({message: dicomsOrMessage});
          } else if (dicomsOrMessage.errors !== undefined){
            organizerStore.update({errors: dicomsOrMessage.errors});
          } else {
            organizerStore.update({dicoms: dicomsOrMessage});
            steps.complete();
            busy.state = false;
            busy.reason = '';
            const errors = organizerStore.get().errors;
            const errorsLength = errors?errors.length:0;
            const parsingErrors = organizerStore.get().fileErrors.parsing;
            let messageDelay = 2000;
            success.state = 'success';
            if (errorsLength) {
              success.state = 'warning';
              success.reason = `There have been ${errorsLength} errors out of ${dicomsOrMessage.length + errorsLength} files`;
              parsingErrors.files = errors.filter(function(errorObject) {
                const error = errorObject.err;
                const errors = [error];
                // pull in the original error for EmoReg files
                if (error.original) {
                  errors.push(error.original);
                }
                return errors.every(err => err.fileErrorsType !== 'skip-old-name-emo-reg');
              }).map(function(e) {
                return {
                  basename: path.relative(paths[0], e.path),
                  message: e.err.message || e.err
                };
              });
              organizerStore.update({errors: []});
              messageDelay = 5000;
            } else {
              parsingErrors.files = [];
            }
            $rootScope.$apply();
            $timeout(function(){
              success.state = '';
              success.reason = '';
              $rootScope.$apply();
            }, messageDelay);
            steps.next();
          }
        },
        (err) => {
          console.log(err);
          organizerStore.update({error: err});
        },
        () => {
          console.log('Processing completed.');
        }
      );
    });
  }
}
