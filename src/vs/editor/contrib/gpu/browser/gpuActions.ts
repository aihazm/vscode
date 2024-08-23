/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { VSBuffer } from 'vs/base/common/buffer';
import { URI } from 'vs/base/common/uri';
import type { ICodeEditor } from 'vs/editor/browser/editorBrowser';
import { EditorAction, registerEditorAction, type ServicesAccessor } from 'vs/editor/browser/editorExtensions';
import { ensureNonNullable } from 'vs/editor/browser/gpu/gpuUtils';
import { GlyphRasterizer } from 'vs/editor/browser/gpu/raster/glyphRasterizer';
import { ViewLinesGpu } from 'vs/editor/browser/viewParts/linesGpu/viewLinesGpu';
import { localize } from 'vs/nls';
import { IConfigurationService } from 'vs/platform/configuration/common/configuration';
import { ContextKeyExpr } from 'vs/platform/contextkey/common/contextkey';
import { IFileService } from 'vs/platform/files/common/files';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { ILogService } from 'vs/platform/log/common/log';
import { IQuickInputService } from 'vs/platform/quickinput/common/quickInput';
import { IWorkspaceContextService } from 'vs/platform/workspace/common/workspace';

class DebugEditorGpuRendererAction extends EditorAction {

	constructor() {
		super({
			id: 'editor.action.debugEditorGpuRenderer',
			label: localize('gpuDebug.label', "Developer: Debug Editor GPU Renderer"),
			alias: 'Developer: Debug Editor GPU Renderer',
			// TODO: Why doesn't `ContextKeyExpr.equals('config:editor.experimentalGpuAcceleration', 'on')` work?
			precondition: ContextKeyExpr.true(),
		});
	}

	async run(accessor: ServicesAccessor, editor: ICodeEditor): Promise<void> {
		const instantiationService = accessor.get(IInstantiationService);
		const quickInputService = accessor.get(IQuickInputService);
		const choice = await quickInputService.pick([
			{
				label: localize('logTextureAtlasStats.label', "Log Texture Atlas Stats"),
				id: 'logTextureAtlasStats',
			},
			{
				label: localize('saveTextureAtlas.label', "Save Texture Atlas"),
				id: 'saveTextureAtlas',
			},
			{
				label: localize('drawGlyph.label', "Draw Glyph"),
				id: 'drawGlyph',
			},
		], { canPickMany: false });
		if (!choice) {
			return;
		}
		switch (choice.id) {
			case 'logTextureAtlasStats':
				instantiationService.invokeFunction(accessor => {
					const logService = accessor.get(ILogService);

					const atlas = ViewLinesGpu.atlas;
					if (!ViewLinesGpu.atlas) {
						logService.error('No texture atlas found');
						return;
					}

					const stats = atlas.getStats();
					logService.info(['Texture atlas stats', ...stats].join('\n\n'));
				});
				break;
			case 'saveTextureAtlas':
				instantiationService.invokeFunction(async accessor => {
					const workspaceContextService = accessor.get(IWorkspaceContextService);
					const fileService = accessor.get(IFileService);
					const folders = workspaceContextService.getWorkspace().folders;
					if (folders.length > 0) {
						const atlas = ViewLinesGpu.atlas;
						const promises = [];
						for (const [layerIndex, page] of atlas.pages.entries()) {
							promises.push(...[
								fileService.writeFile(
									URI.joinPath(folders[0].uri, `textureAtlasPage${layerIndex}_actual.png`),
									VSBuffer.wrap(new Uint8Array(await (await page.source.convertToBlob()).arrayBuffer()))
								),
								fileService.writeFile(
									URI.joinPath(folders[0].uri, `textureAtlasPage${layerIndex}_usage.png`),
									VSBuffer.wrap(new Uint8Array(await (await page.getUsagePreview()).arrayBuffer()))
								),
							]);
						}
						await Promise.all(promises);
					}
				});
				break;
			case 'drawGlyph':
				instantiationService.invokeFunction(async accessor => {
					const configurationService = accessor.get(IConfigurationService);
					const fileService = accessor.get(IFileService);
					const logService = accessor.get(ILogService);
					const quickInputService = accessor.get(IQuickInputService);
					const workspaceContextService = accessor.get(IWorkspaceContextService);

					const folders = workspaceContextService.getWorkspace().folders;
					if (folders.length === 0) {
						return;
					}

					const atlas = ViewLinesGpu.atlas;
					if (!ViewLinesGpu.atlas) {
						logService.error('No texture atlas found');
						return;
					}

					const fontFamily = configurationService.getValue<string>('editor.fontFamily');
					const fontSize = configurationService.getValue<number>('editor.fontSize');
					const rasterizer = new GlyphRasterizer(fontSize, fontFamily);
					let chars = await quickInputService.input({
						prompt: 'Enter a character to draw (prefix with 0x for code point))'
					});
					if (!chars) {
						return;
					}
					const codePoint = chars.match(/0x(?<codePoint>[0-9a-f]+)/i)?.groups?.codePoint;
					if (codePoint !== undefined) {
						chars = String.fromCodePoint(parseInt(codePoint, 16));
					}
					const metadata = 0;
					const rasterizedGlyph = atlas.getGlyph(rasterizer, chars, metadata);
					if (!rasterizedGlyph) {
						return;
					}
					const imageData = atlas.pages[rasterizedGlyph.pageIndex].source.getContext('2d')?.getImageData(
						rasterizedGlyph.x,
						rasterizedGlyph.y,
						rasterizedGlyph.w,
						rasterizedGlyph.h
					);
					if (!imageData) {
						return;
					}
					const canvas = new OffscreenCanvas(imageData.width, imageData.height);
					const ctx = ensureNonNullable(canvas.getContext('2d'));
					ctx.putImageData(imageData, 0, 0);
					const blob = await canvas.convertToBlob({ type: 'image/png' });
					const resource = URI.joinPath(folders[0].uri, `glyph_${chars}_${metadata}_${fontSize}px_${fontFamily.replaceAll(/[,\\\/\.'\s]/g, '_')}.png`);
					await fileService.writeFile(resource, VSBuffer.wrap(new Uint8Array(await blob.arrayBuffer())));
				});
				break;
		}
	}
}

registerEditorAction(DebugEditorGpuRendererAction);