const esbuild = require('esbuild');

const production = process.argv.includes('--production');
const watch = process.argv.includes('--watch');

async function main() {
    const ctx = await esbuild.context({
        entryPoints: ['./src/extension.ts'],
        bundle: true,
        format: 'cjs',
        minify: production,
        sourcemap: !production,
        sourcesContent: false,
        platform: 'node',
        outfile: './out/extension.js',
        external: [
            'vscode',           // VS Code API is provided at runtime
            'playwright',       // Playwright has native dependencies
            'playwright-core',  // Playwright core
        ],
        logLevel: 'info',
        plugins: [
            /* add plugins here */
        ],
    });

    if (watch) {
        await ctx.watch();
        console.log('Watching for changes...');
    } else {
        await ctx.rebuild();
        await ctx.dispose();
        console.log('Build complete!');
    }
}

main().catch(e => {
    console.error(e);
    process.exit(1);
});
