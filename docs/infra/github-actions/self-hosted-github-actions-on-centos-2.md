---
id: self-hosted-github-actions-on-centos-2
title: Docker도 GitHub Actions도 처음인 CI/CD 구축 경험기 (2)
description:  Centos 환경에서 Docker기반의 Self-Hosted GitHub Actions 환경 구축하기 (2)
sidebar_position: 2
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
[이전 글](https://blona.vercel.app/docs/infra/github-actions/self-hosted-github-actions-on-centos-1)에서는 Docker와 GitHub Actions을 활용해 배포 자동화를 구현한 과정과 `Self-Hosted Runner`를 선택하게 된 배경,
그리고 `Runner`머신을 설정하면서 마주한 여러 문제 사황에 대해 정리해보았다.
이번 글에서는 아직 해결되지 않았던 `Runner` 실행 환경 문제를 Docker기반으로 전환하여 해결하고, 배포 자동화를 완성하게 된 과정을 다뤄보려 한다.
<br/>

## Docker에서 Self-Hosted Runner 실행하기
***
앞서 `GLIBCXX` 버전 문제로 인해 `Runner`가 `CentOS 7` 환경에서 정상적으로 실행되지 않아,
다음 대안으로 Docker 컨테이너에서 `ubuntu` 기반으로 `Runner`를 실행하는 방법을 선택했다.

### Runner용 Docker 설정 파일 작성하기
```yml
# Dockerfile
FROM ubuntu:22.04

RUN apt-get update && apt-get install -y wget curl git unzip

# Docker CLI 설치 (컨테이너 내에서 Docker 실행을 위해)
RUN curl -fsSL https://get.docker.com | sh

# 일반 사용자 생성 (sudo 환경 불필요)
RUN useradd -m runner && echo "runner ALL=(ALL) NOPASSWD:ALL" >> /etc/sudoers

# 작업 디렉토리 및 권한 설정
WORKDIR /home/runner/actions-runner
RUN chown -R runner:runner /home/runner/actions-runner

# GitHub Actions Runner 설치
RUN curl -o actions-runner-linux-x64-2.322.0.tar.gz -L https://github.com/actions/runner/releases/download/v2.322.0/actions-runner-linux-x64-2.322.0.tar.gz # 최신 버전 설치
RUN echo "b13b78... actions-runner-linux-x64-2.322.0.tar.gz" | shasum -a 256 -c
RUN tar xzf ./actions-runner-linux-x64-2.322.0.tar.gz

# Runner 연결 및 실행 스크립트 복사
COPY entrypoint.sh /entrypoint.sh # git repository 연결 및 runner 실행을 위해 작성한 스크립트
RUN chmod +x /entrypoint.sh

USER runner
ENTRYPOINT ["/entrypoint.sh"]
```
`Runner` 컨테이너 내에서 GitHub Actions를 실행하기 위해 필요한 주요 유틸리티를 설치했다.  
- `wget`, `curl`: 원격 패키지 및 스크립트 다운로드
- `git`: GitHub 저장소 클론
- `unzip`: 압축 파일 처리

#### entrypoint.sh
`Runner`와 `Git Repository`을 연결하고 `Runner`를 실행을 위해 스크립트를 따로 작성해주었다. 
```sh
# entrypoint.sh

#!/bin/bash
set -e

GITHUB_REPO="myapp"
GITHUB_TOKEN="{GITHUB_TOKEN}"

# self-hosted runner 와 git repository 연결
./config.sh --url https://github.com/$GITHUB_REPO --token $GITHUB_TOKEN --unattended --replace

# self-hosted runner 서버 실행
exec ./run.sh
```
이 스크립트는 컨테이너가 시작될 때 자동으로 실행된다.

### Docker로 Runner 실행하기
위에서 작성한 `Dockerfile`을 기반으로 `Runner`를 컨테이너에 올리는 과정이다.
```sh
# 기존 Runner가 있다면 중지 및 제거
docker stop github-actions-runner
docker rm github-actions-runner

# Docker 이미지 빌드
docker build -t github-actions-runner .

# Runner 실행
docker run -d --name github-actions-runner github-actions-runner
```
이렇게 명령어를 실행하면 Docker 컨테이너가 생성되고, `Self-Hosted Runner`가 정상적으로 실행된다.
하지만 이제부터 `Runner` 컨테이너 내부에 실제 서비스를 빌드하고, 배포하는 작업이 가능해야 한다.
문제는 앞서 이전 글의 첫 문단에서 설명했듯이 내 서비스도 Docker 기반으로 배포되고 있다는 점이다. 
즉 `Runner` 컨테이너 내부에서 또 다른 Docker 컨테이너를 실행하거나 제어할 수 있어야 한다.  

이를 해결하기 위해 사용하는 방식이 바로 **Docker in Docker (DooD)** 구조다.  

:::note
### Docker in docker란
말 그대로 Docker 컨테이너 내부에서 또 다른 Docker 컨테이너를 실행하는 구조를 의미한다. 이러한 구조는 크게 두 가지 방식으로 나뉜다.
- **DinD (Docker in Docker)**: 컨테이너 내부에서 별도의 Docker 데몬을 설치하고 실행하는 방식
- **DooD (Docker outside of Docker)**: 호스트 머신의 Docker 데몬을 컨테이너에 공유하여, 외부 Docker를 제어하는 방식
:::

이번 프로젝트에는 **DooD** 방식을 채택했다.  
**DinD**는 별도의 네트워크 격리, 권한이나 네트워크 문제 및 성능 관련 이슈가 발생할 위험이 있고,
컨테이너 내부에서는 또 다른 Docker 환경을 완전히 구성해야한다는 점에서 복잡도가 높다.

반면 **DooD**는 호스트의 Docker 데몬을 직접 제어하기 때문에, 별도의 Docker 환경을 구성할 필요가 없고,
네트워크나 파일 시스템 접근도 자연스럽게 처리할 수 있다.
다만, 이 방식도 컨테이너가 호스트를 제어할 수 있기 때문에 보안상 주의가 필요하다.

### Docker Volume 기반 DooD 방식 배포 구성
`Docker Volume`과 Docker 소켓 공유를 통해 `Runner` 컨테이너가 호스트와 직접 연동되도록 구성한다.
- **공유 디렉토리**: 빌드 결과물이나 로그 파일을 호스트의 `Runner` 컨테이너 간에 공유하기 위해 `Docker Volume` 디렉토리를 사용한다.
  - 일반적으로 `/mnt` 디렉토리에 서비스 단위로 하위 디렉토리를 생성해서 사용한다.
- **Docker 소켓 마운트**: 컨테이너 내부에서 호스트의 Docker 데몬에 직접 접근할 수 있도록 `docker.sock`을 공유한다.

이 구성 방식은 컨테이너가 호스트처럼 Docker 명령을 실행할 수 있도록 해주며,
호스트 네트워크, 포트 설정, 기존 Docker Compose 설정 등을 그대로 활용할 수 있는 장점이 된다.


#### Runner 실행 명령어에 옵션 추가하기
```sh
docker run -d \
--name github-actions-runner \
-v /mnt/myapp-deploy \
-v /var/run/docker.sock:/var/run/docker.sock \
github-actions-runner
```
- `-v /mnt/myapp-deploy`: 위에서 정의한 공유 디렉토리 경로를 `Runner` 컨테이너에 마운트하기 위한 옵션
- `-v /var/run/docker.sock:/var/run/docker.sock`: 호스트의 Docker 소켓을 공유하기 위한 옵션
  - `docker` 관련 명령을 실행 할 수 있고, 호스트 네트워크 기반으로 컨테이너 내부 서비스 역시 동작할 수 있게 된다.

이제 Runner 컨테이너와 내부 서비스 컨테이너까지 잘 실행되는 것을 확인한 후, 전체적인 프로세스를 워크플로우에서 실행할 수 있도록 수정했다.
#### Github Actions 워크플로우 수정
```yml
name: Deploy MyApp

on:
push:
branches:
  - main

workflow_dispatch:

jobs:
deploy:
runs-on: self-hosted

  steps:
    - name: Checkout repository
      uses: actions/checkout@v3

    - name: Setup Node.js
      uses: actions/setup-node@v3
      with:
        node-version: '22'
        cache: 'npm'

    - name: Install dependencies
      run: npm install

    - name: Install build
      run: npm run build

    # 공유디렉토리에서 잔존하는 패키지 제거 및 새 패키지 복사
    - name: Move package to shared directory
      run: |
        rm -rf /mnt/myapp-deploy/dist
        cp -r dist /mnt/myapp-deploy/ 
      working-directory: ${{ github.workspace }} # 루트 디렉토리 설정

    # 공유디렉토리로 이동 및 Docker 실행
    - name: Run Docker Compose on host
      run: |
        cd /mnt/myapp-deploy  
        docker compose down  
        docker rm -f nodejs22 || true  
        docker compose up -d --build
```

이 방식은 `Runner`가 호스트와 직접 연결되어 동작하기 때문에, 호스트의 네트워크 설정 및 포트 바인딩을 그대로 활용할 수 있다.
> 단, `Runner` 컨테이너 내부에 `docker` 명령을 실행하려면 Docker CLI가 미리 설치되어있어야 한다.

수정한 워크플로우를 토대로 최종적으로 배포 테스트를 진행해보니 성공적으로 배포가 진행되었음을 확인할 수 있었다.

### 마무리
이번 프로젝트는 CI/CD 자동화의 전 과정을 제대로 느낄 수 있던 경험이었다.
Docker도 GitHub Actions도 처음 다뤄봤지만, 크게 어렵지 않을 거라 생각했던 작업이 CentOS 버전 문제, Docker-in-Docker 구조, 권한 이슈 등
예상치 못한 상황들로 인해 많은 시행착오를 겪었다.

그 과정에서 문제를 하나씩 마주하고 직접 해결해나가며 실제로 CI/CD가 어떻게 작하는지에 더 깊게 이해하게 된 기회였다.
특히, 보안이 강화된 내부망 환경에서의 CI/CD는 `Self-Hosted Runner`가 좋은 대안이 될 수 있다는 점을 직접 체감했고, 
Docker 기반으로 안정적인 구성을 통해 배포 자동화의 유연성을 높일 수 있었다.

앞으로는 단순히 작동하는 자동화를 넘어서, 내 환경에 최적화된 CI/CD가 무엇인지 고민해볼 수 있는 시야가 생긴 것 같다. 

### +유지보수 중 발생한 문제 (2025.07)
이후 몇 차례의 작은 수정 사항만 있었고, 큰 변경 없이 몇 달에 한 번씩 간간히 배포를 진행해왔다.  
새로운 수정사항을 배포 하던 과정에서 `Runner` 컨테이너가 정상적으로 실행되지 않는 문제가 발생했다.  
문제의 원인은 단순했지만, 해결 과정을 정리해두면 좋을 것 같아 아래에 추가로 작성해두었다.  
[crontab을 활용한 시간 동기화 문제 해결](https://blona.vercel.app/docs/infra/time-sync-issue)