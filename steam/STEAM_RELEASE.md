# Публикация «Кристального фронта» в Steam

Репозиторий собирает отдельное Windows-приложение. В него входят только файлы «Кристального фронта», без каталога остальных игр Lumina.

## 1. Создание приложения

1. Завершите регистрацию партнёра в Steamworks и оплатите Steam Direct Fee.
2. Активируйте app credit и создайте приложение «Кристальный фронт».
3. Запишите выданные `App ID` и `Depot ID` Windows-депо.

## 2. Сборка

Локально на Windows:

```powershell
npm ci
npm test
python -m pip install pillow
python scripts/make-steam-assets.py
npx electron-builder --win dir --x64
```

Или запустите workflow **Steam Windows build** на GitHub. Готовая папка будет в артефакте `CrystalFront-windows-x64`.

Исполняемый файл для Launch Options: `Crystal Front.exe`. Операционная система: Windows 10/11, архитектура x64.

## 3. SteamPipe

Сгенерируйте VDF с настоящими идентификаторами:

```powershell
npm run steam:vdf -- --app-id 123456 --depot-id 123457 --content "dist/win-unpacked"
```

Загрузите сборку из каталога Steamworks SDK `tools/ContentBuilder/builder`:

```powershell
steamcmd +login STEAM_LOGIN +run_app_build "C:\path\to\repo\dist\steamworks\app_build_123456.vdf" +quit
```

Пароль и код Steam Guard вводятся в SteamCMD. Не сохраняйте их в репозитории. Генератор оставляет `SetLive` пустым: сборка загружается безопасно и назначается ветке вручную в Steamworks.

## 4. Сохранения и Steam Cloud

Игра создаёт один атомарно обновляемый файл:

```text
%APPDATA%\Lumina\Crystal Front\crystal-front-save.json
```

Для Steam Auto-Cloud выберите root `WinAppDataRoaming`, path `Lumina/Crystal Front`, pattern `crystal-front-save.json`, OS `Windows`.

## 5. Страница магазина

Загрузите изображения и шесть реальных скриншотов 1920×1080 из артефакта `CrystalFront-steam-store`. Заполните описание и системные требования из `steam/store-copy.ru.md`, затем отправьте страницу на проверку. После одобрения опубликуйте её как Coming Soon.

После проверки страницы назначьте загруженную сборку ветке `default`, проверьте её через Steam, заполните Build checklist и отправьте сборку на проверку. Финальный выпуск выполняется кнопкой **Release App** в Steamworks.
