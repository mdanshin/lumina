import { mkdir, writeFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import path from 'node:path';

function positiveId(value, name) {
  if (!/^\d+$/.test(value || '') || value === '0') throw new Error(`${name} must be a positive numeric Steam ID`);
  return value;
}

export function makeDepotVdf({ depotId, contentRoot }) {
  return `"DepotBuildConfig"\n{\n\t"DepotID" "${positiveId(depotId, 'depot-id')}"\n\t"ContentRoot" "${contentRoot.replaceAll('\\', '/')}"\n\t"FileMapping"\n\t{\n\t\t"LocalPath" "*"\n\t\t"DepotPath" "."\n\t\t"recursive" "1"\n\t}\n}`;
}

export function makeAppVdf({ appId, depotId, buildOutput }) {
  return `"AppBuild"\n{\n\t"AppID" "${positiveId(appId, 'app-id')}"\n\t"Desc" "Crystal Front ${new Date().toISOString().slice(0, 10)}"\n\t"BuildOutput" "${buildOutput.replaceAll('\\', '/')}"\n\t"ContentRoot" ""\n\t"SetLive" ""\n\t"Preview" "0"\n\t"Depots"\n\t{\n\t\t"${positiveId(depotId, 'depot-id')}" "depot_build_${depotId}.vdf"\n\t}\n}`;
}

export async function prepare({ appId, depotId, content, output }) {
  const contentRoot = path.resolve(content);
  const outputRoot = path.resolve(output);
  await mkdir(outputRoot, { recursive: true });
  await Promise.all([
    writeFile(path.join(outputRoot, `depot_build_${depotId}.vdf`), makeDepotVdf({ depotId, contentRoot })),
    writeFile(path.join(outputRoot, `app_build_${appId}.vdf`), makeAppVdf({ appId, depotId, buildOutput: path.join(outputRoot, 'logs') }))
  ]);
  return path.join(outputRoot, `app_build_${appId}.vdf`);
}

function option(name, fallback) {
  const index = process.argv.indexOf(`--${name}`);
  return index >= 0 ? process.argv[index + 1] : fallback;
}

if (import.meta.url === pathToFileURL(process.argv[1] || '').href) {
  const appId = option('app-id');
  const depotId = option('depot-id');
  const content = option('content', 'dist/win-unpacked');
  const output = option('output', 'dist/steamworks');
  try {
    const appVdf = await prepare({ appId, depotId, content, output });
    console.log(`SteamPipe config created: ${appVdf}`);
  } catch (error) {
    console.error(error.message);
    console.error('Usage: npm run steam:vdf -- --app-id 123456 --depot-id 123457 [--content path]');
    process.exitCode = 1;
  }
}
