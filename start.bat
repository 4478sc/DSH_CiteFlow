@echo off
echo 正在安装依赖...
call npm install

cd client
call npm install
cd ..

echo.
echo 依赖安装完成！
echo.
echo 启动开发服务器...
call npm run dev
