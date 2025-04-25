---
id: self-hosted-github-actions-on-centos-1
title: Docker도 GitHub Actions도 처음인 CI/CD 구축 경험기 (1)
description:  Centos 환경에서 Docker기반의 Self-Hosted GitHub Actions 환경 구축하기 (1)
sidebar_position: 1
tags:
  - github-actions
  - self-hosted-runner
  - ci-cd
  - centos
  - docker
  - 배포자동화
date: 2025-02-23
---
> 2025-02-23, Github Actions과 Docker를 처음 다뤄 본 경험 사례입니다.

### 개요
나의 CI/CD 경험은 실무에서 사용해온 Jenkins나, 개인 프로젝트에서 간단히 활용해본 Vercel 정도였다.
이전까지는 이미 구성된 파이프라인을 단순히 활용하는 수준이었지만, 단독으로 진행하게 된 미니 프로젝트를 계기로 처음부터 직접 CI/CD 파이프라인을 구성해보게 되었다.

새로운 프로젝트에서는 GitHub Actions을 활용해 배포 자동화를 구현했으며, 서버 환경에 맞춰 Docker와 `Self-Hosted Runner`를 선택해 구성헀다.
GitHub Actions을 선택한건 단지 기술적인 선택은 아니었다. 회사에서도 점차 GitHub Actions을 도입하려는 움직임이 있었고,
Jenkins 대비 더 가볍고 빠른 워크플로우라는 점에서 직접 사용해보고 싶다는 생각이 들었다.
이 글에서는 Docker 및 GitHub Actions을 활용해 배포 자동화를 구현한 과정과 `Self-Hosted Runner`를 선택하게 된 이유, 그리고 겪었던 시행착오를 중심으로 경험을 정리해보려 한다.

> 진행 프로젝트의 클라이언트는 Vercel을 통해 사전 빌드되며, 생성된 정적 파일은 webpack으로 빌드된 서버 스크립트와 함께 배포된다.
서버는 Express 기반이며, 클라이언트 빌드 결과물을 정적 리소스로 서빙한다.
전체 애플리케이션은 CentOS 7 기반의 Docker 컨테이너 환경에서 pm2로 서버 스크립트를 실행하는 방식으로 구동된다.

<br/>

## 애플리케이션용 Docker 설정파일 작성
***
Docker에 애플리케이션을 올리기 위해 간단하게 `dockerfile` 설정 파일을 작성하고, `docker-compose`를 활용해 배포 환경을 구성했다.
```yml
# Node.js 22 알파인 이미지 기반  
FROM node:22-alpine  

# 작업 디렉토리 생성  
WORKDIR /app  

# 서버 구동을 위한 pm2 설치
RUN npm install -g pm2 
  
# 클라이언트 빌드 결과물
COPY dist/ /app/dist/ 
  
# 애플리케이션 실행
CMD ["pm2-runtime", "/app/dist/bundle.js"]  
  
# 외부 노출 포트
EXPOSE 9100
```
```yml
# docker-compose.yml
version: "3.8"  
  
services:  
  app:  
    container_name: myapp 
    build: .  
    ports:  
      - "9100:9100"  
    restart: always
```
이제 위 설정 파일을 기반으로, 자동 배포를 위한 GitHub Actions 워크플로우를 구성해보도록 한다.
<br/>

## GitHub Actions을 활용한 CI/CD 구축 시도
***
GitHub Actions의 자동화 배포를 활용하기 위해서 필요한 설정파일인 `.github/workflows/deploy.yml` 작성했다.
배포될 서버 환경은 `ssh` 접속을 통해서만 접근이 가능하므로, 워크플로우 내에 `ssh-agent`를 설정하고, GitHub Secrets에 비밀 키를 등록하는 과정이 필요했다.

아래는 배포를 위해 초안으로 작성된 워크플로우이다.
```yml
# .github/workflows/deploy.yml
name: Deploy to Server

on:
  push:
    branches:
      - main

jobs:
  deploy:
    runs-on: ubuntu-latest

    steps:
      - name: Checkout repository
        uses: actions/checkout@v3

      - name: Install dependencies & build
        run: |
          npm install
          npm run build

      - name: Setup SSH Agent without Logging Keys
        uses: webfactory/ssh-agent@v0.9.0
        with:
          ssh-private-key: |
            ${{ secrets.SSH_PRIVATE_KEY }

      - name: Copy files to Server
        run: |
          scp -o StrictHostKeyChecking=no -r dist/ docker-compose.yml Dockerfile ${{ secrets.SSH_USER }}@${{ secrets.SSH_HOST }}:${{ secrets.DEPLOY_PATH }}

      - name: Deploy on Server
        run: |
          ssh -o StrictHostKeyChecking=no ${{ secrets.SSH_USER }}@${{ secrets.SSH_HOST }} "
          cd ${{ secrets.DEPLOY_PATH }} &&
          docker-compose down &&
          docker-compose up -d --build
```
워크플로우 대로 실행해보니 아래와 같은 에러가 발생했다.
```
ssh: connect to host *** port 22: Connection timed out

[8](https://github.com/{repository}/actions/runs/13511680546/job/37752967101#step:5:9)scp: Connection closed
```
이 에러 메세지를 보고 한 가지 놓친 점이 있다는 것을 깨달았다.
GitHub Actions는 GitHub에서 운영하는 외부 서버에서 워크플로우를 실행하기 때문에, 내가 배포하려는 대상 서버처럼 외부 접근에 대한 제한이 있는 환경에서는 `ssh` 접근이 애초에 불가능한 문제였다.  

### Self-Hosted Runner을 도입하게 된 이유
위 에러에 대한 해결 방안으로 GitHub Actions에서 제공하는 기능인 `Self-Hosted Runner`를 도입하기로 했다.
보안적 접근 제한이 있는 배포 대상 서버의 내부에 직접 `Runner`머신을 설치함으로써, GitHub Actions의 빌드 및 배포 과정을 내부 네트워크 내에서 실행할 수 있도록 구성했다.
<br/>

## Self-Hosted Runner을 활용하여 CI/CD 구축
***

### Self-Hosted Runner란
GitHub Actions 워크플로우를 GitHub에서 제공하는 기본 호스팅 서버가 아닌 사용자 서버에서 가능하도록 하는 기능이다.
사용자 서버에서 GitHub이 제공하는 전용 에이전트 프로그램을 설치하여 에이전트가 GitHub과 연결을 유지하며 트리거 발생 시 작업을 수신하여 진행하는 방식이다.

### Self-Hosted Runner 설정
1. `GitHub Repository > Settings > Actions > Runners`에서 새 Runner 생성
2. `.github/workflow/deploy.yml`에서 `runs-on: self-hosted`로 설정 변경
3. 워크플로우를 실행할 서버에서 메뉴얼 대로 `Runner` 설치 및 실행

`Runner`을 실행하기 전 초안으로 작성해뒀던 워크플로우를 수정된 환경에 맞게 수정했다.
```yml
# .github/workflow/deploy.yml
name: Deploy to Server with Self-Hosted Runner

on:
  push:
    branches:
      - main

jobs:
  deploy:
    # Self-Hosted Runner 설정
    runs-on: self-hosted

    steps:
      - name: Checkout repository
        uses: actions/checkout@v3

      - name: Install dependencies
        run: npm install

      - name: Build project
        run: npm run build

      - name: Deploy using Docker
        run: |
          docker-compose down
          docker-compose up -d --build
```
### 문제 상황 발생 1 - 권한 문제
`Runner`에 필요한 에이전트를 설치 후 서버 실행을 시도하니 아래와 같은 에러가 발생했다.
```
Must not run with sudo
```
이는 `sudo`권한 또는 `root`계정으로 `Runner`를 실행하려 할 때 발생하는 오류로, GitHub에서는 보안상 해당 스크립트를 관리자 권한으로 실행하는 것을 금지하고 있다.
현재 내가 `Runner`를 구성하던 환경이 `root`계정 이었기 때문에, 일반 사용자 계정을 별도로 생성한 후 해당 계정으로 `Runner`를 설치하여 문제를 해결 할 수 있었다.

### 문제 상황 발생 2 - 서버 환경 문제
앞선 문제를 해결하고 `Runner`를 다시 실행하려던 중, 또 다른 유형의 난관에 봉착했다.
```
/home/myapp/actions-runner/bin/Runner.Listener: /usr/lib64/libstdc++.so.6: version `GLIBCXX_3.4.20' not found (required by /home/myapp/actions-runner/bin/Runner.Listener)
...
Runner listener exit with terminated error, stop the service, no retry needed. Exiting runner...
```
실행에 필요한 C++ 런타임 라이브러리인 `GLIBCXX_3.4.20` 및 `GLIBCXX_3.4.21` 버전이 시스템에 존재하지 않아 실행이 중단되는 문제가 발생했다.  

현재 사용 중인 서버는 `CentOS 7.9`기반으로, 기본적으로 포함된 `libstdc++.so.6`의 버전이 낮아 해당 심볼을 제공하지 않는다.
당시 고려했던 해결 방안으로 아래와 같이 세 가지를 떠올렸다.
1. 서버의 `CentOS` 버전을 업그레이드하여 최신 `libstdc++` 포함
2. `libstdc++.so.6` 파일만 수동으로 최신 바이너리로 교체
3. `GitHub Actions Runner` 자체를 다운그레이드하여 구버전 라이브러리와 호환

그러나 1번과 2번은 시스템 안정성과 해당 서버에 운영 중인 다른 서비스들에 영향을 줄 수 있어 리스크가 크다고 판단했다.   
3번 방안이 실질적인 대안이 될 것 같아 시도 했으나, `Runner`는 실행하면 자동으로 최신 버전 업데이트가 강제되어 있어 다운그레이드를 활용할 수 없었다.
관련 이슈는 `GitHub` 공식 레포지토리에서도 확인할 수 있다.  
> 🔗 https://github.com/actions/runner/issues/1843

<br/>

다음 글에서 이어집니다.