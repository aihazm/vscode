/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { deepStrictEqual, strictEqual } from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from 'vs/base/test/common/utils';
import { TextureAtlasShelfAllocator } from 'vs/editor/browser/view/gpu/atlas/textureAtlasAllocator';
import { ensureNonNullable } from 'vs/editor/browser/view/gpu/gpuUtils';
import type { IRasterizedGlyph } from 'vs/editor/browser/view/gpu/raster/glyphRasterizer';

suite('TextureAtlasShelfAllocator', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	const blackInt = 0x000000FF;
	const blackArr = [0x00, 0x00, 0x00, 0xFF];

	const pixel1x1 = createRasterizedGlyph(1, 1, [...blackArr]);
	const pixel2x1 = createRasterizedGlyph(2, 1, [...blackArr, ...blackArr]);
	const pixel1x2 = createRasterizedGlyph(1, 2, [...blackArr, ...blackArr]);

	let canvas: OffscreenCanvas;
	let ctx: OffscreenCanvasRenderingContext2D;
	let allocator: TextureAtlasShelfAllocator;

	let lastUniqueGlyph: string;
	function getUniqueGlyphId(): [string, number] {
		if (!lastUniqueGlyph) {
			lastUniqueGlyph = 'a';
		} else {
			lastUniqueGlyph = String.fromCharCode(lastUniqueGlyph.charCodeAt(0) + 1);
		}
		return [lastUniqueGlyph, blackInt];
	}

	setup(() => {
		canvas = new OffscreenCanvas(5, 5);
		ctx = ensureNonNullable(canvas.getContext('2d'));
		allocator = new TextureAtlasShelfAllocator(canvas, ctx);
	});

	test('single allocation', () => {
		deepStrictEqual(allocator.allocate(...getUniqueGlyphId(), pixel1x1), {
			index: 0,
			x: 0, y: 0,
			w: 1, h: 1,
			originOffsetX: 0, originOffsetY: 0,
		});
	});
	test('wrapping', () => {
		// 1oooo
		// ooooo
		// ooooo
		// ooooo
		// ooooo
		deepStrictEqual(allocator.allocate(...getUniqueGlyphId(), pixel1x1), {
			index: 0,
			x: 0, y: 0,
			w: 1, h: 1,
			originOffsetX: 0, originOffsetY: 0,
		});
		// 12ooo
		// o2ooo
		// ooooo
		// ooooo
		// ooooo
		deepStrictEqual(allocator.allocate(...getUniqueGlyphId(), pixel1x2), {
			index: 1,
			x: 1, y: 0,
			w: 1, h: 2,
			originOffsetX: 0, originOffsetY: 0,
		});
		// 1233o
		// o2ooo
		// ooooo
		// ooooo
		// ooooo
		deepStrictEqual(allocator.allocate(...getUniqueGlyphId(), pixel2x1), {
			index: 2,
			x: 2, y: 0,
			w: 2, h: 1,
			originOffsetX: 0, originOffsetY: 0,
		});
		// 1233x
		// x2xxx
		// 44ooo
		// ooooo
		// ooooo
		deepStrictEqual(allocator.allocate(...getUniqueGlyphId(), pixel2x1), {
			index: 3,
			x: 0, y: 2,
			w: 2, h: 1,
			originOffsetX: 0, originOffsetY: 0,
		}, 'should wrap to next line as there\'s no room left');
		// 1233x
		// x2xxx
		// 4455o
		// ooooo
		// ooooo
		deepStrictEqual(allocator.allocate(...getUniqueGlyphId(), pixel2x1), {
			index: 4,
			x: 2, y: 2,
			w: 2, h: 1,
			originOffsetX: 0, originOffsetY: 0,
		});
		// 1233x
		// x2xxx
		// 44556
		// ooooo
		// ooooo
		deepStrictEqual(allocator.allocate(...getUniqueGlyphId(), pixel1x1), {
			index: 5,
			x: 4, y: 2,
			w: 1, h: 1,
			originOffsetX: 0, originOffsetY: 0,
		});
		// 1233x
		// x2xxx
		// 44556
		// 7oooo
		// ooooo
		deepStrictEqual(allocator.allocate(...getUniqueGlyphId(), pixel1x1), {
			index: 6,
			x: 0, y: 3,
			w: 1, h: 1,
			originOffsetX: 0, originOffsetY: 0,
		});
	});
});

function createRasterizedGlyph(w: number, h: number, data: ArrayLike<number>): IRasterizedGlyph {
	strictEqual(w * h * 4, data.length);
	const source = new OffscreenCanvas(w, h);
	const imageData = new ImageData(w, h);
	imageData.data.set(data);
	ensureNonNullable(source.getContext('2d')).putImageData(imageData, 0, 0);
	return {
		source,
		boundingBox: { top: 0, left: 0, bottom: h - 1, right: w - 1 },
		originOffset: { x: 0, y: 0 },
	};
}