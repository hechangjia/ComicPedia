#!/bin/bash
# =============================================================
# ComicPedia 展示模式 - 本地打包 → 服务器部署
#
# 部署流程：
#   1. ./deploy-showcase.sh build          # 本地打包镜像
#   2. ./deploy-showcase.sh save           # 导出为 tar.gz
#   3. 通过 1Panel 或 scp 上传 comicpedia-showcase.tar.gz 到服务器
#   4. 在服务器上: docker load < comicpedia-showcase.tar.gz
#   5. 在服务器上: docker compose up -d
#   6. ./deploy-showcase.sh export-data    # 本地导出漫画数据
#   7. ./deploy-showcase.sh import-data http://server:6623 YOUR_TOKEN
# =============================================================

set -e

IMAGE_NAME="comicpedia:showcase"
TAR_FILE="comicpedia-showcase.tar.gz"
DATA_FILE="comicpedia-backup.json"

case "${1:-help}" in
  build)
    echo ">>> 构建展示模式镜像..."
    docker build \
      --build-arg SHOWCASE_MODE=true \
      -t "$IMAGE_NAME" .
    echo ""
    echo ">>> 构建完成: $IMAGE_NAME"
    docker images "$IMAGE_NAME" --format "    大小: {{.Size}}"
    ;;

  save)
    echo ">>> 导出镜像为 $TAR_FILE ..."
    docker save "$IMAGE_NAME" | gzip > "$TAR_FILE"
    echo ">>> 导出完成: $(du -h "$TAR_FILE" | cut -f1)"
    echo ""
    echo "接下来："
    echo "  1. 通过 1Panel 文件管理或 scp 上传 $TAR_FILE 到服务器"
    echo "  2. 上传 docker-compose.showcase.yml 到服务器的 ~/comicpedia/"
    echo "  3. 在服务器上执行:"
    echo "     cd ~/comicpedia"
    echo "     docker load < comicpedia-showcase.tar.gz"
    echo "     docker compose -f docker-compose.showcase.yml up -d"
    ;;

  export-data)
    LOCAL_PORT="${2:-3000}"
    echo ">>> 导出本地数据 (localhost:$LOCAL_PORT) ..."
    curl -sf "http://localhost:$LOCAL_PORT/api/backup/export" > "$DATA_FILE"
    if [ $? -ne 0 ]; then
      echo "错误: 无法连接 localhost:$LOCAL_PORT，请确保本地开发服务器在运行 (pnpm dev)"
      exit 1
    fi
    SIZE=$(du -h "$DATA_FILE" | cut -f1)
    echo ">>> 导出完成: $DATA_FILE ($SIZE)"
    echo ""
    echo "接下来上传到服务器："
    echo "  ./deploy-showcase.sh import-data http://YOUR_SERVER:6623 YOUR_ADMIN_TOKEN"
    ;;

  import-data)
    SERVER="${2:?用法: ./deploy-showcase.sh import-data http://SERVER:6623 TOKEN}"
    TOKEN="${3:?请提供 ADMIN_TOKEN}"
    if [ ! -f "$DATA_FILE" ]; then
      echo "错误: 找不到 $DATA_FILE，请先运行 ./deploy-showcase.sh export-data"
      exit 1
    fi
    echo ">>> 上传数据到 $SERVER ..."
    RESULT=$(curl -s -w "\n%{http_code}" -X POST "$SERVER/api/backup/import" \
      -H "Content-Type: application/json" \
      -H "Authorization: Bearer $TOKEN" \
      -d "@$DATA_FILE")
    HTTP_CODE=$(echo "$RESULT" | tail -1)
    BODY=$(echo "$RESULT" | head -1)

    if [ "$HTTP_CODE" = "200" ]; then
      echo ">>> 导入成功! $BODY"
    elif [ "$HTTP_CODE" = "401" ]; then
      echo ">>> 导入失败: ADMIN_TOKEN 不正确"
      exit 1
    else
      echo ">>> 导入失败 (HTTP $HTTP_CODE): $BODY"
      exit 1
    fi
    ;;

  *)
    cat <<'HELP'
ComicPedia 展示模式部署工具

用法：
  ./deploy-showcase.sh build              构建展示模式 Docker 镜像
  ./deploy-showcase.sh save               导出镜像为 .tar.gz 文件
  ./deploy-showcase.sh export-data [PORT] 从本地导出漫画数据 (默认端口 3000)
  ./deploy-showcase.sh import-data URL TOKEN  上传数据到服务器

完整部署流程：
  本地:
    1. ./deploy-showcase.sh build
    2. ./deploy-showcase.sh save

  服务器 (通过 1Panel 或 SSH):
    3. 上传 comicpedia-showcase.tar.gz + docker-compose.showcase.yml
    4. docker load < comicpedia-showcase.tar.gz
    5. 编辑 docker-compose.showcase.yml 修改 ADMIN_TOKEN
    6. docker compose -f docker-compose.showcase.yml up -d

  上传数据:
    7. ./deploy-showcase.sh export-data
    8. ./deploy-showcase.sh import-data http://server:6623 your-token

  Cloudflare:
    9. 在 Cloudflare Zero Trust 中添加隧道:
       域名: comic.yourdomain.com → localhost:6623
HELP
    ;;
esac
