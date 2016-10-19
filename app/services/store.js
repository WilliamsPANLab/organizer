'use strict';
const angular = require('angular');

const app = angular.module('app');
const {mapToSeriesRow} = require('../common/uiformatters');
const {groupBy,uniqBy} = require('lodash');
const {normalizeSubjectCode} = require('../common/engage');

app.factory('organizerStore', organizerStore);

organizerStore.$inject = [];

function organizerStore() {
  const state = {
    progress: {
      state: 0
    },
    loaded: {
      size: 0
    },
    success: {
      state: ''
    },
    busy: {
      state: false
    },
    fileErrors: {
      parsing: {
        title: 'Parsing Errors',
        files: []
      },
      previouslyUploaded: {
        title: 'Previously Uploaded',
        files: []
      },
      mismatch: {
        title: 'Uploaded Incorrectly',
        files: []
      }
    }
  };
  const service = {
    get: get,
    update: update
  };
  return service;

  function get() {
    return state;
  }
  function update(update) {
    if (typeof update.dicoms !== 'undefined') {
      update.seriesDicoms = mapToSeriesRow(update.dicoms);
      update.rawDicoms = true;
    }
    if (typeof update.acquisitions !== 'undefined') {
      // we use these acquisitions to be able to do two things:
      // - we'd like to find the right acquisition to attach a file to
      const sessions = uniqBy(update.acquisitions.map(a => a.session), function(session) {
        return session.uid;
      })
      update.subjectToSessions = groupBy(sessions, function(session) {
        return normalizeSubjectCode(session.subject.code);
      });
      // - we'd like to avoid uploading files that already exist
      update.fileHashToAcquisition = {};
      for (const acquisition of update.acquisitions) {
        for (const file of acquisition.files) {
          update.fileHashToAcquisition[file.hash] = acquisition;
        }
      }
    }
    Object.assign(state, update);
    return state;
  }

}
