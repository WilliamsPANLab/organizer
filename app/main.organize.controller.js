'use strict';

const angular = require('angular');
const app = angular.module('app');
const {humanReadableSize} = require('./common/uiformatters.js');
const path = require('path');

app.controller('organizeCtrl', organizeCtrl);

organizeCtrl.$inject = ['steps', 'organizerStore'];

function organizeCtrl(steps, organizerStore){
  /*jshint validthis: true */
  const vm = this;
  const loaded = organizerStore.get().loaded;
  if (!organizerStore.get().rawDicoms){
    vm.projects = organizerStore.get().projects;
  } else {
    updateTable();
  }
  vm.fileErrors = organizerStore.get().fileErrors;
  vm.handleKeyOnInput = handleKeyOnInput;
  vm.humanReadableSize = humanReadableSize;
  vm.select = select;
  vm.isEmptyObject = isEmptyObject;

  steps.complete();
  function select(container, value) {
    const initialValue = container.state;
    if (typeof value !== 'undefined') {
      container.state = value;
    } else if (container.state === 'checked'){
      container.state = false;
    } else {
      container.state = 'checked';
    }
    if (container.size) {
      const increment = (!container.state)?-container.size:container.size;
      loaded.size += increment;
    }
    const childContainers = container.children || {};
    container.selectedCount = 0;
    container.indeterminateCount = 0;
    for (let k of Object.keys(childContainers)){
      select(childContainers[k], container.state);
    }
    if (container.state) {
      container.selectedCount = Object.keys(childContainers).length;
    }
    if (typeof value === 'undefined' && container.parent) {
      updateParent(container.parent, initialValue, container.state);
    }
  }
  function updateParent(container, oldValue, newValue) {
    const initialValue = container.state;
    container.selectedCount = container.selectedCount || 0;
    container.indeterminateCount = container.indeterminateCount || 0;
    if (oldValue === 'indeterminate') {
      container.indeterminateCount -= 1;
    } else if (oldValue === 'checked') {
      container.selectedCount -= 1;
    }
    if (newValue === 'checked') {
      container.selectedCount += 1;
    } else if (newValue === 'indeterminate') {
      container.indeterminateCount += 1;
    }
    const numChildren = Object.keys(container.children).length;
    if (container.selectedCount === numChildren) {
      container.state = 'checked';
    } else if (container.indeterminateCount + container.selectedCount > 0) {
      container.state = 'indeterminate';
    } else {
      container.state = false;
    }
    if (container.parent){
      updateParent(container.parent, initialValue, container.state);
    }
    organizerStore.update({projects: vm.projects});
  }

  function updateTable() {

    loaded.size = 0;
    const seriesDicoms = organizerStore.get().seriesDicoms||[];
    const { detectedProjectLabel, fileErrors } = organizerStore.get();
    fileErrors.previouslyUploaded.files = [];
    fileErrors.mismatch.files = [];
    let sessions = {};
    let project = {
      label: detectedProjectLabel || 'Untitled',
      children: sessions
    };
    seriesDicoms.forEach((dicom) => {
      if (dicom.uploadStatus === 'previously-uploaded') {
        // is file errors the best place to report previously uploaded files?
        fileErrors.previouslyUploaded.files.push({
          basename: path.basename(dicom.path),
          message: 'this file was previously uploaded'
        });
        return;
      }

      if (!sessions.hasOwnProperty(dicom.sessionUID)) {
        sessions[dicom.sessionUID] = {
          children: {},
          sessionTimestamp: dicom.sessionTimestamp,
          patientID: dicom.patientID,
          parent: project,
          labels: {},
          acquisitionsUID: {}
        };
      }
      const acquisitions = sessions[dicom.sessionUID].children;
      const acquisitionsUID = sessions[dicom.sessionUID].acquisitionsUID;
      const labels = sessions[dicom.sessionUID].labels;
      dicom.acquisitionLabel = dicom.acquisitionLabel.replace(/\//g, ' ');
      if (!acquisitionsUID.hasOwnProperty(dicom.acquisitionUID)) {
        if (acquisitions.hasOwnProperty(dicom.acquisitionLabel)) {
          const labelCount = labels[dicom.acquisitionLabel];
          labels[dicom.acquisitionLabel] += 1;
          dicom.acquisitionLabel = dicom.acquisitionLabel + ' ' + labelCount;
        } else {
          labels[dicom.acquisitionLabel] = 1;
        }
        acquisitions[dicom.acquisitionLabel] = {
          parsedFiles: [],
          acquisitionLabel: dicom.acquisitionLabel,
          acquisitionUID: dicom.acquisitionUID,
          acquisitionTimestamp: dicom.acquisitionTimestamp,
          count: 0,
          newCount: 0,
          size: 0,
          parent: sessions[dicom.sessionUID]
        };
        acquisitionsUID[dicom.acquisitionUID] = dicom.acquisitionLabel;
      } else {
        dicom.acquisitionLabel = acquisitionsUID[dicom.acquisitionUID];
      }
      let acquisition = acquisitions[dicom.acquisitionLabel];
      acquisition.count += 1;
      if (dicom.uploadStatus === 'needs-upload') {
        acquisition.newCount += 1;
        acquisition.size += dicom.size;
        acquisition.parsedFiles.push(dicom);
      } else if (dicom.uploadStatus === 'server-and-file-header-mismatch') {
        fileErrors.mismatch.files.push({
          basename: path.basename(dicom.path),
          message: 'This file and the server have a mismatch'
        });
      }
    });
    select(project);
    vm.projects = [project];
    organizerStore.update({projects: vm.projects, rawDicoms: false});
  }
  function handleKeyOnInput(container, field, event) {
    if (!container['_' + field]) {
      return;
    } else if (event.which === 13) {
      container[field] = container['_' + field];
      organizerStore.update({projects: vm.projects});
      container.editing = !container.editing;
    } else if (event.which === 27) {
      container.editing = !container.editing;
    }
  }
  function isEmptyObject(obj) {
    return Object.keys(obj).length === 0;
  }
}
