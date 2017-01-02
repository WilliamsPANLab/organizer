const engage = require('../../app/common/engage');
const assert = require('assert');
const {Buffer} = require('buffer');
const moment = require('moment-timezone');
const sinon = require('sinon');
const {groupBy} = require('lodash');

const physio = Buffer.from(`% Start time: 2015-01-02 04:03:04.567890
some stats here`);

const ispot = Buffer.from(`Header = Start
Product = ispot
DateTime = 2015/01/02 04:03:04
`);

const emoReg = Buffer.from(`hi,date,participant,
,2015_Jan_02_0403,00012345-2,
`);

const emoRegWithExtraInfo = Buffer.from(`hi,hey,sup,no_date,no_participant
${Buffer.alloc(50).join('\n')}

extraInfo
date,2015_Jan_02_0403
session,000
participant,EX12345`);

const testSessions = [
  {
    uid: 1,
    timestamp: '2015-11-02T12:03:04',
    subject: {
      code: '00012345'
    }
  },
  {
    uid: 2,
    timestamp: '2015-01-02T12:03:04',
    subject: {
      code: '00012345'
    }
  },
  {
    uid: 3,
    timestamp: '2015-02-02T00:03:04',
    timezone: 'America/Los_Angeles',
    subject: {
      code: '00012345'
    }
  },
  {
    uid: 4,
    timestamp: '2015-11-02T12:03:04',
    subject: {
      code: '00014414'
    }
  }
];
const subjectToSessions = groupBy(testSessions, s => engage.normalizeSubjectCode(s.subject.code));

const organizerStore = {
  get() {
    return { subjectToSessions };
  }
}

describe('extractMetadata', function() {
  it('fails for empty files', function() {
    assert(() =>
      engage._extractMetadata(Buffer.alloc(0), 'something')
    , /is empty/);
  });

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
    } = engage._extractMetadata(emoReg, 'hi/files/00012345-1_emoreg.csv');
    assert.equal(subjectCode, '12345');
    assert(fileDate.isSame(moment.tz('2015-01-02T12:03', 'UTC')));
  });

  it('works for emoreg files with extra info sections', function() {
    const {
      fileDate,
      subjectCode
    } = engage._extractMetadata(emoRegWithExtraInfo, 'hi/files/00012345-1_emoreg.csv');
    assert.equal(subjectCode, '12345');
    assert(fileDate.isSame(moment.tz('2015-01-02T12:03', 'UTC')));
  });

  [
    'MV00001_closestdraft1_2000_Mar_01_0000',
    'MV0000102MO_closestdraft1_2000_Mar_01_0000',
    '0001_closestdraft1_2000_Mar_01_0000',
    '_closestdraft1_2000_Mar_01_0000'
  ].forEach(function(name) {
    it('fails for emo reg files that have not been renamed', function() {
      assert.throws(() =>
        engage._extractMetadata(Buffer.from('hi,date,participant'), `hi/files/${name}.csv`)
      , /skipping EmoReg files that have not been renamed/);
    });
  });

  it('fails for emo reg files missing a visit number', function() {
    assert.throws(() =>
      engage._extractMetadata(emoReg, 'hi/files/00012345_emoreg.csv')
    , /does not follow the emo reg name pattern/);
  });

  it('fails for emo reg files missing a leading zero', function() {
    assert.throws(() =>
      engage._extractMetadata(emoReg, 'hi/files/0012345-3_emoreg.csv')
    , /does not follow the emo reg name pattern/);
  });

  it('fails for emo reg files with only headers', function() {
    assert.throws(() =>
      engage._extractMetadata(Buffer.from('hi,date,participant'), 'hi/files/00012345-1_emoreg.csv')
    , /only has headers/);
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
    const primary = '00012345-1_emoreg.csv';
    const noPrimaryName = '00012345-1_emoregElse.xlsx';
    const files = [
      { path: '00012345-1_emoreg.psydat' },
      { path: primary },
      { path: '00012345-1_emoregblocks.csv' },
      { path: '00012345-1_emoreg.xlsx' },
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

describe('_similarSubjectError', function() {
  before(function() {
    engage.setSessions(testSessions);
  });

  it('has a message when there are no sessions', function() {
    assert.equal(
      engage._similarSubjectError('00000', '2015-11-03'),
      'There are no sessions on 2015-11-03 in Flywheel.');
  });

  it('returns a list of likely alternative subjects', function() {
    assert.equal(
      engage._similarSubjectError('14441', '2015-11-02'),
      'Is the name of this subject mistyped? Here are some subjects that had sessions on 2015-11-02: 00014414, 00012345');
  });
});
