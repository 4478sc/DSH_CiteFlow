#!/bin/bash
echo "正在安装依赖..."
npm install

cd client
npm install
cd ..

echo ""
echo "依赖安装完成！"
echo ""
echo "启动开发服务器..."
npm run dev
