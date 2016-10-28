const engage = require('../../app/common/engage');
const assert = require('assert');
const {Buffer} = require('buffer');
const moment = require('moment-timezone');
const sinon = require('sinon');

const physio = Buffer.from(`% Start time: 2015-01-02 12:03:04.567890
some stats here`);

const ispot = Buffer.from(`Header = Start
Product = ispot
DateTime = 2015/01/02 04:03:04
`);

const emoReg = Buffer.from(`hi,date,participant,
,2015_Jan_02_0403,00012345-2,
`);

const subjectToSessions = {
  '12345': [
    {
      uid: 1,
      timestamp: '2015-11-02T12:03:04Z',
      subject: {
        code: '00012345'
      }
    },
    {
      uid: 2,
      timestamp: '2015-01-02T12:03:04Z',
      subject: {
        code: '00012345'
      }
    }
  ]
};

const organizerStore = {
  get() {
    return { subjectToSessions };
  }
}

describe('extractMetadata', function() {
  it('works for physio files', function() {
    const {
      fileDate,
      subjectCode
    } = engage._extractMetadata(physio, 'hi/ex12345/file.txt');
    assert.equal(subjectCode, '12345');
    assert(fileDate.isSame(moment.tz('2015-01-02T12:03:04.567', 'UTC')));
  });

  it('works for ispot files', function() {
    const {
      fileDate,
      subjectCode
    } = engage._extractMetadata(ispot, 'hi/files/00012345-1_Log.txt');
    assert.equal(subjectCode, '12345');
    assert(fileDate.isSame(moment.tz('2015-01-02T12:03:04', 'UTC')));
  });

  it('works for emoreg files', function() {
    const {
      fileDate,
      subjectCode
    } = engage._extractMetadata(emoReg, 'hi/files/something.csv');
    assert.equal(subjectCode, '12345');
    assert(fileDate.isSame(moment.tz('2015-01-02T12:03', 'UTC')));
  });
});

describe('engage parse file', function() {
  it('works for non-EmoReg files', function() {
    const stub = sinon.stub();
    const files = [
      { path: 'ex12345/hi.txt' },
      { path: 'ex12345/hiagain.csv' }
    ];
    const parseFileHeaders = sinon.spy(engage.wrapParseFileHeaders(stub, organizerStore));
    const parser = engage.wrapParseFile(function(filePath) {
      return Promise.resolve({
        path: filePath,
        header: parseFileHeaders(physio, filePath)
      });
    });
    engage.setFiles(files);
    return Promise.all(files.map(f => parser(f.path))).then(function(items) {
      // we never call parseFileHeaders in engage parsing. only our custom method
      assert.equal(stub.callCount, 0);
      items.forEach(function(item, index) {
        assert.equal(item.header.PatientID, '00012345');
        assert.equal(parseFileHeaders.args[index][1], item.path);
      });
    });
  });

  it('works in EmoReg mode', function() {
    const stub = sinon.stub().throws(new Error('hi'));
    const primary = 'something.csv';
    const noPrimaryName = 'something-else.xlsx';
    const files = [
      { path: 'something.psydat' },
      { path: primary },
      { path: 'somethingblocks.csv' },
      { path: 'something.xlsx' },
      { path: noPrimaryName }
    ];
    const parseFileHeaders = sinon.spy(engage.wrapParseFileHeaders(stub, organizerStore));
    const parser = engage.wrapParseFile(function(filePath) {
      const content = filePath === primary || filePath === noPrimaryName ? emoReg : new Buffer('');
      return Promise.resolve({
        path: filePath,
        header: parseFileHeaders(content, filePath)
      });
    });
    engage.setFiles(files);
    const parsed = files.map(f => parser(f.path));

    return Promise.all(parsed).then(function(items) {
      // we only call our custom parsing function for engage
      assert.equal(stub.callCount, 0);
      for (const item of items) {
        assert.deepEqual(item.header.PatientID, '00012345');
      }
      assert.equal(parseFileHeaders.callCount, 5);
      assert.equal(parseFileHeaders.firstCall.args[1], primary);
    });
  });
});
