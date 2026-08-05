import test from 'node:test';
import assert from 'node:assert/strict';
import { attributionStyle } from '../src/mark.js';
import { chartDefaults } from '../src/options.js';

const layout = { fontFamily: 'Helvetica', textColor: '#191919' };

/**
 * Default on, and removable in one option. The licence asks for credit rather
 * than demanding it, and a mark that cannot be turned off is a mark that gets
 * the library rejected in review.
 */
test('the mark is on by default', () => {
    assert.equal(chartDefaults().layout.attributionLogo, true);
});

test('it anchors where the reader starts', () => {
    assert.match(attributionStyle(layout, 'en'), /left:8px/);
    assert.match(attributionStyle(layout, 'en-GB'), /left:8px/);
    assert.match(attributionStyle(layout, 'ar'), /right:8px/);
    assert.match(attributionStyle(layout, 'ar-SA'), /right:8px/);
    assert.match(attributionStyle(layout, 'he'), /right:8px/);
});

test('an unknown or missing language falls back to left', () => {
    for (const lang of ['', undefined, null, 'zz']) {
        assert.match(attributionStyle(layout, lang), /left:8px/);
    }
});

test('it never sets both sides, which would stretch it across the chart', () => {
    for (const lang of ['en', 'ar']) {
        const style = attributionStyle(layout, lang);

        assert.ok(! (/(^|;)left:/.test(style) && /(^|;)right:/.test(style)));
    }
});

test('it takes the chart s own type and colour rather than imposing its own', () => {
    const style = attributionStyle({ fontFamily: 'Georgia', textColor: '#abcdef' }, 'en');

    assert.match(style, /Georgia/);
    assert.match(style, /color:#abcdef/);
});

test('it is positioned absolutely, so it cannot push the chart around', () => {
    assert.match(attributionStyle(layout, 'en'), /position:absolute/);
});
