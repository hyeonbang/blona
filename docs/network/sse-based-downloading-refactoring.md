---
id: sse-based-downloading-refactoring
title: SSE 기반의 다운로드 기능 개선 경험
description: 기존의 Polling 방식에서 SSE 기반의 다운로드 기능 개선 경험을 담은 문서
sidebar_position: 1
tags:
  - sse
  - polling
  - stream
  - download
date: 2025-03-27
---
> 2025-03-27, React19 기반 프로젝트에서 작성된 사례입니다.

### 개요
회사에서 관리하고 있는 프로젝트 중에는, 특정 조건에 따라 텍스트 파일을 다운로드받는 기능이 있다.
이 기능은 요청 시 새 창을 띄워 일정 간격으로 서버에 반복 요청을 보내고, 다운로드 링크가 생성되면 파일을 받는 구조로 구현되어 있었다.
최근 이 기능을 기반으로 새로운 프로젝트를 구성하게 되면서, 기존 방식에서 느꼈던 아쉬운 점들을 개선하고자 SSE(Server-Sent Events)를 도입해보았고, 그 과정을 정리해보려 한다.
<br/>

## 기존 Polling 방식의 프로세스
***
일정 간격으로 서버에 반복 요청을 보내어 상태를 받아오는 과정을 `Polling`방식이라고 말한다.
기존 구조는 1회의 다운로드 요청을 보내면 상태값으로 다운로드 링크를 응답으로 받기 전까지 2초 간격으로 반복 요청하게 되어 있었다.
아래는 프로세스를 정리해보았다.

1. 다운로드 요청을 위해 `code`를 요청하는 API를 호출한다.
2. 해당 `code`을 사용하여 다운로드 파일을 요청한다.
3. 2초 간격으로 파일을 받을 때까지 반복적으로 API를 호출한다. (`Polling`)
4. 실제 파일 응답을 받을 때까지 무한 반복한다.
5. 응답으로 파일 링크를 받으면 다운로드 시킨다.

#### Polling 방식의 단점
- 과도한 트래픽
	- 파일을 받을 때까지 반복적으로 요청해야하므로 트래픽이 증가한다.
	- 다수의 사용자가 대량의 다운로드 요청을 할 경우, 서버 부하가 급증할 수 있다.

- 비효율적인 자원 사용
	- 클라이언트가 계속해서 요청을 보내야 하므로 브라우저 쓰레드를 지속적으로 점유해야한다.
	- 요청 중 다른 작업을 수행하기 어렵다.
		- 이에 대한 개선책으로 다운로드 건 수마다 새 창을 띄우는 방식을 적용하였지만, 이는 피로감을 유발할 수 있다는 사용자 경험을 초래한다.
<br/>

## SSE의 프로세스와 도입 후 차이점
***
### SSE란 (Server-Send Events)
우리가 일반적으로 사용하는 통신 방식에는 클라이언트가 요청을 보내고 서버가 응답하는 `단일 요청 - 단일 응답` 방식과, 연결을 유지하며 양방향으로 데이터를 주고받는 `WebSocket` 방식이 있다.

SSE(Server-Sent Events) 는 `WebSocket`처럼 클라이언트와 서버 간의 연결을 유지하지만,  
차이점은 양방향 통신이 아닌, **서버에서 클라이언트로만 데이터를 푸시하는 단방향 통신 방식**이라는 점이다.

즉, 서버가 실시간으로 상태 업데이트를 클라이언트에 지속적으로 전달할 수 있으므로,  
푸시 알림, 구독 알림, 실시간 상태 업데이트 등의 기능에 매우 적합하다.

### SSE의 장점 (Polling 대비 개선점)
- `Polling`처럼 API 반복 요청 없이 서버가 상태 변경 시점에만 클라이언트에 데이터를 전송하므로 요청 트래픽이 줄고, 서버 부하를 효과적으로 줄일 수 있다.
- 다운로드 진행률을 서버가 직접 푸시하여 클라이언트의 별도 요청 없이도 상태값을 받아올 수 있다.
- `Polling`은 클라이언트가 지속적으로 요청을 보내면서 리소스를 사용하지만, `SSE`는 연결 한 후 필요한 데이터만 푸시되므로 자원낭비가 없다.
- `WebSocket` 대비 설정이 간단하고, `HTTP` 기반이므로 방화벽에 문제가 없다.

### SSE 구현을 위한 테스트 코드
브라우저에서 `SSE`를 구독하려면 `EventSource`객체를 사용한다.  
이는 클라이언트가 서버와 단반향 스트림을 통해 지속적으로 메시지를 받을 수 있도록 해주는 표준 인터페이스이다.  
아래는 클라이언트가 서버의 `SSE`를 구독하고 상태를 수신받는 구조이다.
```ts
const eventSource = new EventSource(`/subscribe`);

eventSource.onmessage = (event) => {
    const { status } = JSON.parse(event.data); // string 형태로 내려오는 JSON 데이터 일 경우 파싱 처리
    console.log(`다운로드 상태: ${ status }`);

    if (status === 'COMPLETED') {
        eventSource.close(); // SSE 연결 종료
    }
};

eventSource.onerror = (error) => {
    console.error("SSE 연결 오류:", error);
    eventSource.close();
};
```
서버에서 전달되는 `event.data`는 기본적으로 문자열 형태이기 때문에, 일반적으로 JSON 데이터를 다룰 경우 `JSON.parse()`를 통해 객체로 변환해주어야한다.

아래 코드는 클라이언트가 `SSE`를 구독 요청하면, 서버가 1초 간격으로 상태값을 전달하는 서버 코드이다.  
`count`가 `5`에 도달하면 `COMPLETED`로 바꾸고 스트림을 종료한다.
```ts
import express from 'express';

const router = express.Router();

router.get('/subscribe', (req, res) => {
	res.set({
		'Content-Type': 'text/event-stream',
		'Cache-Control': 'no-cache',
		'Connection': 'keep-alive'
	})

	let count = 0;
	const interval = setInterval(() => {
		count++;

		const status = count >= 5 ? 'COMPLETED' : 'IN_PROGRESS';

		res.write(`data: ${ JSON.stringify({ status }) }\n\n`); // 문자열 형태로 전송
		if (status === 'COMPLETED') {
			clearInterval(interval);
			res.end(); // 스트림 종료
		}
	}, 1000)

	req.on('close', () => clearInterval(interval));
});  
```

### 실제 구현한 방식
앞서 클라이언트와 서버간의 통신은 테스트 코드를 통해 쉽게 구현되는 것을 확인했다.  
하지만 우리 프로젝트의 구성은 `클라이언트 - 서버` 구조가 아니라 `클라이언트 <-> BFF 미들웨어 <-> 백엔드 서버` 구조로 구성되어있기 때문에
미들웨어가 `SSE`를 중계해주는 역할이 되어야 했다.

#### 미들웨어의 역할
- 백엔드에 SSE 구독을 하는 백엔드 서버에 대한 클라이언트 역할을 한다.
- 클라이언트에 SSE를 연결하여 클라에 대한 서버 역할을 한다.
- 백엔드에서 받은 다운로드 상태를 그대로 클라이언트에 전달한다.

#### 프로젝트 구조에 따른 SSE의 데이터 흐름
```
클라이언트 -> (SSE 구독) -> 미들웨어 -> (SSE 구독) -> 백엔드
클라이언트 <- (상태값 전달) <- 미들웨어 <- (상태값 받음) <- 백엔드
```

### 프로젝트 구조에 따른 구현 코드
클라이언트 구조는 테스트 코드와 비슷한 흐름으로 작성되어 있으므로 별도의 코드는 생략하도록 한다.  
미들웨어 서버는 중계자 역할을 하므로, 클라이언트의 `SSE` 구독 요청을 받는 동시에 백엔드 서버의 `SSE`를 구독해야 한다.  
즉, 클라이언트가 미들웨어 서버에 `SSE` 요청을 보내면, 서버는 내부적으로 백엔드 SSE 엔드포인트를 `EventSource`로 구독하고,  
그로부터 전달받은 메시지를 클라이언트에 스트림형식으로 그대로 전달해주는 구조이다.
```ts
import express from 'express';
import EventSource from 'eventsource';

const router = express.Router();

router.get('/subscribe/:code', (req, res) => {
	const { code } = req.params;

	res.set({
		'Content-Type': 'text/event-stream',
		'Cache-Control': 'no-cache',
		'Connection': 'keep-alive'
	});

	// 백엔드 SSE 구독
	const backendEventSource = new EventSource(`{ backendEndPoint }/subscribe/${ code }`);

	backendEventSource.onmessage = (event) => {
		res.write(`data: ${ event.data }\n\n`);
	};

	backendEventSource.onerror = (e) => {
		console.error("백엔드 SSE 연결 에러:", e);
		res.write(`data: ${ JSON.stringify({ status: 'ERROR' }) }\n\n`);
		res.end();
		backendEventSource.close();
	};

	req.on('close', () => {
		backendEventSource.close();
	});
});
```
<br/>

## SSE 개선 작업 중 궁금했던 점
***
### 1. 요청할 때마다 새로운 스트림이 열리게 될까?
그렇다. `new EventSource(url)`을 호출 할 때마다 새로운 `SSE`연결이 생성되므로, 불필요한 리소스 방지를 위해 같은 요청에 대한 `eventSource`의 객체가 없을 경우에만 새로운 스트림을 생성할 수 있도록 중복방지 코드를 작성해주는 것이 좋다.
```ts
if (!eventSource) {
	eventSource = new EventSource('/subscribe');
}
```

불필요한 리렌더링을 방지하고 SSE 연결을 하나로 유지하기 위해 `useRef`을 활용했다.  
초기화된 `EventSource` 인스턴스를 `eventSourceRef`에 저장해두고, 이미 연결되어 있는 경우에는 새로 생성하지 않도록 구성한 방식이다.
```ts
const eventSourceRef = useRef(null);

const startSSE = () => {
    if (!eventSourceRef.current) {
        eventSourceRef.current = new EventSource('/subscribe');
        eventSourceRef.current.onmessage = (e) => console.log('데이터:', e.data);
    }
};
```
만약 매번 다른 요청이 주어진다면, 요청때마다 새로운 스트림을 열어야하고, 같은 조건의 요청에 대해서만 새로운 스트림이 열리지 않게 하려면 `Map`을 활용하여 요청별 스트림을 관리하는 방법이 있다.
```ts
const eventSourceMap = new Map<string, EventSource>();

const startSSE = (code: string) => {
	if (eventSourceMap.has(code)) { // 해당 code에 대한 요청을 중복으로 하는 경우 요청 제한
		console.log(`이미 연결된 스트림: ${ code }`);
		return;
	}

	const eventSource = new EventSource(`/subscribe/${ code }`);
	eventSourceMap.set(code, eventSource); // code 별 요청 저장

	eventSource.onmessage = (event) => {
		const { status } = JSON.parse(event.data);

		if (status === 'COMPLETED') {
			eventSource.close();
			eventSourceMap.delete(code); // 해당 code애 대한 요청 삭제
		}
	};

	eventSource.onerror = (error) => {
		console.error("SSE 연결 오류:", error);
		eventSource.close();
		eventSourceMap.delete(code);
	};
}
```

### 2. 서버에 응답이 없으면 스트림이 계속 지속되는지?
SSE 연결은 기본적으로 서버가 응답을 보내지 않더라도 계속 유지된다.
하지만, 연결이 오래 유지되면 클라이언트 (브라우저)나 서버에서 타임아웃이 발생할 가능성이 있다.
이 경우는 eventSource의 `onerror`이벤트가 발생하므로 SSE을 종료하거나 자동 재연결로 처리할 수 있다.

### 3. 스트림을 무한하게 생성할 수 있을까?
SSE 연결은 브라우저마다 기본적으로 설정되어있는 최대 갯수가 있다.
평균적으로 크롬이나, 파이어폭스, 엣지 등과 같은 대표 브라우저들은 동일한 origin에 한해 6개까지 제한을 두고 있고 이 이상의 스트림 연결 요청이 있을 경우 브라우저에서 큐를 쌓아 이후 요청들을 처리한다.

<br/>

## 개선 작업을 진행하면서 느낀 점
***
제한 갯수 이상의 요청이 겹쳐도 브라우저가 알아서 스트림을 큐처럼 쌓아주기 때문에, 생각보다 관리가 편했고 서버의 부담도 덜 수 있어서 이 점이 의외로 큰 장점처럼 느껴졌다.
물론 `Polling`방식에도 분명한 장점은 있다. 구현이 단순하고, 대부분의 브라우저나 네트워크 환경에서 안정적으로 동작하며 주기적으로 확인할 수 있기 때문에 예측 가능성이 높다는 점에서 유용하다.  

하지만 `SSE`는 트래픽을 점유하지 않는 단일 연결로 실시간 상태를 받을 수 있기 때문에, 새 창을 띄우지 않아도 되고, 하나의 화면 안에서 다운로드 상태를 실시간으로 확인하고 처리할 수 있다는 점이
이번 니즈에는 더 적합한 방식이었다.
결과적으로 어떤 방식이 더 좋다고 단정짓기보다는, 사용 목적과 상황에 따라 적절히 전략을 선택해 적용하는 것이 중요하다고 느꼈다.
특히 실시간성과 자원 효율이 중요한 상황이라면, `SSE`는 좋은 대안이 될 수 있다.
