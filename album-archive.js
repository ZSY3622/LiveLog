(() => {
  'use strict';

  const idPattern = /^record-[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/;
  const permission = { mode: 'readwrite' };
  const workspaceKey = window.location.pathname;
  const localFile = window.location.protocol === 'file:';
  const supportsDirectoryPicker = typeof window.showDirectoryPicker === 'function';

  function resultOf(request) {
    return new Promise((resolve, reject) => {
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }

  async function readAuthorization() {
    try {
      const request = window.indexedDB.open('livelog-album-archive', 1);
      request.onupgradeneeded = () => request.result.createObjectStore('directories');
      const database = await resultOf(request);
      database.onversionchange = () => database.close();
      const directory = await resultOf(database.transaction('directories').objectStore('directories').get(workspaceKey));
      return { database, directory };
    } catch {
      return {};
    }
  }

  const authorization = localFile && supportsDirectoryPicker ? readAuthorization() : Promise.resolve({});

  async function rememberDirectory(state, directory) {
    state.directory = directory;
    try {
      if (!state.database) return;
      await new Promise((resolve, reject) => {
        const transaction = state.database.transaction('directories', 'readwrite');
        transaction.oncomplete = resolve;
        transaction.onabort = () => reject(transaction.error);
        const store = transaction.objectStore('directories');
        if (directory) store.put(directory, workspaceKey);
        else store.delete(workspaceKey);
      });
    } catch {
      // The current page can still use the approved directory handle.
    }
  }

  async function requestDirectory(state) {
    const directory = state.directory;
    if (directory) {
      const access = await directory.queryPermission(permission);
      if (access === 'granted') return directory;
      if (access === 'prompt') {
        if (await directory.requestPermission(permission) === 'granted') return directory;
        throw new Error('未获得项目目录的写入权限，表单内容已保留。');
      }
    }
    try {
      return await window.showDirectoryPicker({ ...permission, id: 'livelog-public' });
    } catch (error) {
      if (error.name === 'AbortError') throw new Error('已取消目录授权，表单内容已保留。');
      throw new Error('无法申请目录权限。请用桌面版 Chrome 或 Edge 直接打开本地 albums.html。');
    }
  }

  async function readProject(directory) {
    if (directory.name !== 'public') throw new Error();
    const albums = await directory.getDirectoryHandle('albums');
    const manifest = await directory.getFileHandle('album-data.js');
    const source = await (await manifest.getFile()).text();
    const assignment = /^window\.ALBUM_DATA = (\[[\s\S]*\]);\s*$/m.exec(source);
    const records = assignment && JSON.parse(assignment[1]);
    if (!Array.isArray(records) || records.some(record => !idPattern.test(record?.id) || typeof record.createdAt !== 'string')) throw new Error();
    return { albums, manifest, records, header: source.slice(0, assignment.index) };
  }

  async function findAlbum(albums, id) {
    const usedNames = new Set();
    for await (const entry of albums.values()) {
      usedNames.add(entry.name.normalize('NFC').toLowerCase());
      if (entry.kind !== 'directory') continue;
      try {
        const metadata = await entry.getFileHandle('album.json');
        const record = JSON.parse(await (await metadata.getFile()).text());
        if (record?.id === id) return { folder: entry, record };
      } catch (error) {
        if (error.name !== 'NotFoundError' && !(error instanceof SyntaxError)) throw error;
      }
    }
    return { usedNames };
  }

  function folderName(title, usedNames) {
    const safe = title.normalize('NFC').replace(/[<>:"/\\|?*\x00-\x1f\x7f]/g, '_').replace(/^[ .]+|[ .]+$/g, '');
    const characters = [...safe];
    const encoder = new TextEncoder();
    while (encoder.encode(characters.join('')).length > 220) characters.pop();
    let name = characters.join('').replace(/[ .]+$/g, '') || '未命名专辑';
    if (/^(?:con|prn|aux|nul|com[1-9]|lpt[1-9])$/i.test(name.split('.')[0])) name = `_${name}`;
    let candidate = name;
    let suffix = 2;
    while (usedNames.has(candidate.toLowerCase())) candidate = `${name} (${suffix++})`;
    return candidate;
  }

  function localFilename(value, directory, id) {
    if (typeof value !== 'string' || !/^\/?public\/albums\//.test(value)) return value;
    const [folder, filename] = value.replace(/^\//, '').slice('public/albums/'.length).split('/');
    const decoded = decodeURIComponent(folder).normalize('NFC');
    return decoded === directory.normalize('NFC') || decoded === id ? filename : value;
  }

  async function actualFilename(folder, filename) {
    const names = [];
    for await (const entry of folder.values()) {
      if (entry.kind !== 'file' || entry.name.toLowerCase() !== filename.toLowerCase()) continue;
      if (entry.name === filename) return filename;
      names.push(entry.name);
    }
    return names.sort()[0] ?? filename;
  }

  async function forManifest(folder, record) {
    const entry = { ...record };
    const prefix = `public/albums/${encodeURIComponent(folder.name)}/`;
    const cover = localFilename(record.cover, folder.name, record.id);
    const motion = localFilename(record.motionUrl, folder.name, record.id);
    if (/^cover\.(?:jpe?g|png|webp)$/i.test(cover)) entry.cover = prefix + await actualFilename(folder, cover);
    if (/^motion\.m3u8$/i.test(motion)) {
      entry.motionUrl = prefix + await actualFilename(folder, motion);
      try {
        await folder.getFileHandle('motion.mp4');
        entry.motionFile = prefix + 'motion.mp4';
      } catch (error) {
        if (error.name !== 'NotFoundError') throw error;
      }
    }
    return entry;
  }

  async function writeFile(handle, content) {
    const writer = await handle.createWritable();
    try {
      await writer.write(content);
      await writer.close();
    } catch (error) {
      await writer.abort().catch(() => {});
      throw error;
    }
  }

  async function saveInProject(state, directory, { id, initial, changes }) {
    let project;
    try {
      project = await readProject(directory);
    } catch {
      if (state.directory === directory) await rememberDirectory(state, undefined);
      throw new Error('请选择 LiveLog 项目的 public 文件夹，其中应包含 albums 和 album-data.js。');
    }
    if (state.directory !== directory) await rememberDirectory(state, directory);
    const existing = await findAlbum(project.albums, id);
    if (!existing.record && (!initial || project.records.some(record => record.id === id))) {
      throw new Error('项目中找不到这张唱片的 album.json。');
    }
    const record = { ...(existing.record || initial), ...changes, id };
    if (typeof record.title !== 'string' || !record.title.trim() || !['vinyl', 'cd'].includes(record.format)) {
      throw new Error('请填写专辑名称并选择介质。');
    }
    for (const field of ['artist', 'version', 'price', 'purchaseChannel', 'note', 'source', 'cover', 'motionUrl', 'storeUrl']) {
      record[field] ??= '';
    }
    record.createdAt ||= new Date().toISOString();
    delete record.motionFile;
    const folder = existing.folder || await project.albums.getDirectoryHandle(folderName(record.title, existing.usedNames), { create: true });
    const records = project.records.filter(item => item.id !== id);
    records.push(await forManifest(folder, record));
    records.sort((first, second) => first.createdAt.localeCompare(second.createdAt) || first.id.localeCompare(second.id));

    const metadata = await folder.getFileHandle('album.json', { create: true });
    await writeFile(metadata, JSON.stringify(record, null, 2) + '\n');
    try {
      await writeFile(project.manifest, project.header + 'window.ALBUM_DATA = ' + JSON.stringify(records, null, 2) + ';\n');
    } catch {
      throw new Error('唱片资料已写入，更新清单失败。请重试保存。');
    }
    return records;
  }

  window.saveAlbumToArchive = async data => {
    if (!localFile) throw new Error('当前页面通过网页地址打开。请在 Finder 中用 Chrome 或 Edge 打开项目里的 albums.html，确认地址以 file:// 开头。');
    if (!supportsDirectoryPicker) throw new Error('当前浏览器不支持目录写入。请在电脑的独立 Chrome 或 Edge 窗口打开 albums.html。');
    if (!idPattern.test(data.id)) throw new Error('唱片编号无效。');
    const state = await authorization;
    const directory = await requestDirectory(state);
    const save = () => saveInProject(state, directory, data);
    return navigator.locks ? navigator.locks.request(`livelog-albums:${workspaceKey}`, save) : save();
  };
})();
