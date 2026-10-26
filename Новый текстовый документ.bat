@echo off
chcp 65001 >nul
title Установка патчей проекта ICP-Contour

echo ===================================================
echo   Запуск применения патчей проекта
echo ===================================================
echo.

:: Проверка наличия Python
python --version >nul 2>&1
if %ERRORLEVEL% NEQ 0 (
    echo [ОШИБКА] Python не найден в системе! 
    echo Убедитесь, что Python установлен и добавлен в PATH.
    echo.
    pause
    exit /b 1
)

:: Установка переменной среды для работы с UTF-8
set PYTHONUTF8=1

echo [1/3] Применение apply-BASE-v6.py...
if exist "apply-BASE-v6.py" (
    python apply-BASE-v6.py
    if %ERRORLEVEL% EQU 0 (
        echo [OK] Патч apply-bake-fix-v2.py успешно применён.
    ) else (
        echo [ОШИБКА] Произошла ошибка при выполнении apply-bake-fix-v2.py!
    )
) else (
    echo [ПРОПУСК] Файл apply-BASE-v6.py не найден.
)
echo.

echo [2/3] Применение apply-BASE-v6.py...
if exist "apply-BASE-v6.py" (
    python apply-BASE-v6.py
    if %ERRORLEVEL% EQU 0 (
        echo [OK] Патч apply-bake-transitions-patch.py успешно применён.
    ) else (
        echo [ОШИБКА] Произошла ошибка при выполнении apply-BASE-v6.py!
    )
) else (
    echo [ПРОПУСК] Файл apply-BASE-v6.py не найден.
)
echo.

echo [3/3] Применение apply-BASE-v6.py...
if exist "apply-BASE-v6.py" (
    python apply-BASE-v6.py
    if %ERRORLEVEL% EQU 0 (
        echo [OK] Патч apply-BASE-v6.py успешно применён.
    ) else (
        echo [ОШИБКА] Произошла ошибка при выполнении apply-BASE-v6.py!
    )
) else (
    echo [ПРОПУСК] Файл apply-BASE-v6.py не найден.
)
echo.

echo ===================================================
echo   Обработка патчей завершена.
echo ===================================================
echo.
pause