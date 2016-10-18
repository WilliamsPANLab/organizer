const {_extractMetadata} = require('../../app/common/engage');
const assert = require('assert');
const {Buffer} = require('buffer');
const moment = require('moment-timezone');

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
