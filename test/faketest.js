/* Specify environment to include mocha globals */
/* eslint-env node, mocha */

'use strict';

const assert = require('chai').assert;

describe('FakeTest', function() {

	it('always pass this test', function() {
		assert.equal(true, true);
	});

});
