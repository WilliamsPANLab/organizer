const {_extractMetadata,createENGAGEParser} = require('../../app/common/engage');
const assert = require('assert');
const {Buffer} = require('buffer');
const moment = require('moment-timezone');
const Rx = require('rx');
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

describe('extractMetadata', function() {
  it('works for physio files', function() {
    const {
      fileDate,
      subjectCode
    } = _extractMetadata(physio, 'hi/ex12345/file.txt');
    assert.equal(subjectCode, '12345');
    assert(fileDate.isSame(moment.tz('2015-01-02T12:03:04.567', 'UTC')));
  });

  it('works for ispot files', function() {
    const {
      fileDate,
      subjectCode
    } = _extractMetadata(ispot, 'hi/files/00012345-1_Log.txt');
    assert.equal(subjectCode, '12345');
    assert(fileDate.isSame(moment.tz('2015-01-02T12:03:04', 'UTC')));
  });

  it('works for emoreg files', function() {
    const {
      fileDate,
      subjectCode
    } = _extractMetadata(emoReg, 'hi/files/something.csv');
    assert.equal(subjectCode, '12345');
    assert(fileDate.isSame(moment.tz('2015-01-02T12:03', 'UTC')));
  });
});

describe('createENGAGEParser', function() {
  it('works for non-EmoReg files', function() {
    const stub = sinon.stub();
    const files = [
      'hi.csv',
      'hiagain.csv'
    ];
    const $files = Rx.Observable.fromArray(files);
    const parser = createENGAGEParser($files, stub);
    return Promise.all(files.map(f => parser(f))).then(function() {
      assert.deepEqual(files, stub.args.map(args => args[0]));
    });
  });

  it('works in EmoReg mode', function() {
    const output = { testing: 123 };
    const stub = sinon.stub().returns(Promise.resolve(output));
    const primary = 'something.csv';
    const files = [
      'something.psydat',
      primary,
      'somethingblocks.csv',
      'something.xlsx',
      'something-else.xlsx'
    ];
    const $files = Rx.Observable.fromArray(files);
    const parser = createENGAGEParser($files, stub);
    const parsed = files.map(f => parser(f));
    const noPrimary = parsed.pop();
    return Promise.all([
      noPrimary.catch(function(err) {
        assert.equal(
          err.message,
          'Could not find primary EmoReg data file for something-else.xlsx, looked for something-else.csv');
      }),
      Promise.all(parsed).then(function(items) {
        for (const item of items) {
          assert.deepEqual(item, output);
        }
        assert.equal(stub.callCount, 1);
        assert.equal(stub.firstCall.args[0], primary);
      })
    ]);
  });
});
