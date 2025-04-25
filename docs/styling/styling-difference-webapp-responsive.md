---
id: styling-difference-webapp-responsive
title: 웹앱과 웹 반응형 스타일링의 차이와 대응 방법
description: 모바일 웹앱(WebApp)과 웹 반응형(Web Responsive) 환경을 동일한 디자인으로 구현하기
sidebar_position: 1
tags:
- mobileweb
- webapp
- responsive-design
- viewport
- 스타일링
- 웹앱
date: 2025-02-05
---
> 2025-02-05, Angular, SCSS 기반 프로젝트에서 작성된 사례입니다.

### 개요
운영 중인 프로젝트에는 모바일 앱에 제공되는 `웹앱 (Webapp/WebView)`과 `웹반응형 (Web Responsive)`을 동시에 지원하는 웹 페이지가 있다.  
스타일을 리뉴얼하는 과정에서 두 환경의 화면 출력 방식 차이로 인해 발생한 문제와 이를 해결한 과정에 대해 정리해보았다.
<br/>

## 기존 스타일링의 구조
***
기존 스타일링은 웹앱과 웹반응형의 구분 없이 작성되어 있었으며, 모바일 기준의 웹앱 가이드를 바탕으로 전반적인 스타일이 구성되어 있었다.  
`breakpoint`별로 `font-size`를 지정하고, 그에 따라 `height`, `gap` 등의 요소 크기를 비례 계산하는 방식이었는데, 이로 인해 반응형 웹 환경에서는 화면이 전반적으로 확대된 느낌을 주는 문제가 있었다.  

이를 보완하기 위해 일부 요소에 대해 개발자가 임의로 `font-size`, `button size` 등을 디바이스 너비 기준으로 축소해 적용했으나, 다음과 같은 구조적인 문제가 드러났다.
- 스타일 요소마다 기준 `font-size`가 제각각이어서 전체적인 기준을 파악하기 어려움
- 모든 스타일 계산에 비율 함수 `em()`를 사용하는 방식이 반복되어 코드의 가독성과 유지보수성 저하

#### 기존 구조에 대한 예시
```css
/* breakpoints.scss 웹 기준 너비 */
$media-xl: 1400px;
$media-lg: 1208px;
$media-md: 916px;
$media-sm: 768px;
$media-xs: 580px;
$media-xxs: 420px;
```
```css
/* item1.scss */
$item-font-size: 24px;

@media (max-width: breakpoint.$media-xs) {
  $item-font-size: 16px;
}
```
```css
/* func.scss */
@function em($px, $basis: 13px) {
  $px: $px * 1px;
  $basis: $basis * 1px;
  @return math.div($px, $basis) * 1em;
}
```
```css
/* content-item.scss */
@use "src/styles/func";
@use "src/styles/item1";

$font-size-base: 13px;

.item {
  $item-font-size: 24px;
  font-size: func.em($item-font-size, $font-size-base);
  /* ... */

    button {
        $font-size: 36px;
        font-size: func.em($font-size, item1.$item-font-size);
        min-height: func.em(48px, item1.$item-font-size);
        /* ... */
    }
}
```
위 예시처럼, 요소마다 `font-size` 기준이 달라지고, 계산 대상 또한 일관되지 않아 전체 UI 비율을 추적하거나 수정하기 어려운 구조가 되어버렸다.
<br/>

## 글로벌 변수를 사용한 스타일링 개선
***
리뉴얼 작업에서는 가이드에 따라 웹앱과 웹반응형을 동일한 스타일 구조로 가는 건 유지하되, `breakpoint`별 스타일 적용을 미디어 쿼리에 따라 글로벌 `CSS`변수(`CSS Custom Properties`)를 활용해
스타일을 제어하는 방식으로 개선했다.

글로별 변수를 사용하게 되면 하나의 기준에서 전체 스타일을 제어할 수 있어 가독성이 좋아지고, 스타일 수정이 있을 때도 중앙 집중적으로 관리할 수 있어 편리하다.
우선 컴포넌트 용도별로 글로벌 변수를 선언하는 파일을 작성하고, 각 사용처에서 이를 가져와 사용했다.

#### 글로벌 변수 선언 파일
```css
/* vars/item.scss */
@use 'src/styles/breakpoint';

:root {
    /* 모바일 너비 */
    --font-size: 12px;
    --item-padding: 12px;
    --item-min-height: 24px;
    --container-gap: 4px;

    --container-min-height: 36px;

    /* md 이상의 너비 */
    @media (min-width: breakpoint.$media-md) {
        --font-size: 16px;
        --item-padding: 24px;
        --item-min-height: 40px;
        --container-gap: 12px;
    }

    /* lg 이상의 너비 */
    @media (min-width: breakpoint.$media-lg) {
        --font-size: 18px;
    }
}
```
`:root`에 글로벌 변수를 선언하고, 미디어 쿼리에 따라 값을 재정의하여 모바일을 기점으로 `breakpoint`별로 덮어씌우는 방식으로 구조를 단순화했다.

#### 글로벌 변수 스타일 적용
```css
/* item.component.scss */
.container {
  display: flex;
  gap: var(--container-gap);
  min-height: var(--container-min-height);

  .item {
    font-size: var(--font-size);
    padding: var(--item-padding);
    min-height: var(--item-min-height);
  }
}
```
코드를 이렇게 개선하고 나니 공통 기준값을 중심으로 관리가 가능해지고, 미디어 쿼리에 따라 자동으로 스타일이 분기되어 가독성과 유지보수가 한층 개선되었다. 또한 웹앱/웹 반응형 공통으로 대응하기 쉬운 구조가 되었다.
<br/>

## 리뉴얼 작업 중 발생한 문제
***
웹앱과 웹반응형을 같은 스타일 구조로 적용하고, 필요한 부분만 예외처리하는 방식으로 작업을 진행하던 중 출력 방식 차이로 인한 문제가 발생했다.  

웹 모바일은 `360px`을 기준으로 스타일이 구성되어 있었고,
이에 반해 모바일 웹앱 가이드는 `720px` 기준으로 설계되어 모든 요소가 웹 모바일 대비 정확히 2배 크기였다.

대부분의 앱 디바이스가 `devicePixelRatio = 2`를 지원하는 점을 고려해,
웹 가이드를 기준으로 스타일을 작성하면 앱에서는 해상도가 2배로 확대되어 자연스럽게 출력될 것이라고 판단했다.
그 결과, 웹과 앱에서 동일한 스타일을 공유하는 방식으로 작업을 진행하게 되었다.

그러나 테스트 중 실제로 앱에서 화면을 확인한 디자이너로부터 **폰트가 너무 작다**는 피드백이 들어왔다.
> 앱 기준(720px)으로 디자인된 요소를 웹 모바일(360px) 기준으로 그대로 작업하면, 앱에서는 화면이 비율로 줄어들어 웹보다 더 작게 보이는 문제가 생긴다.
반대로 웹에서 앱 기준으로 작업하면 실제 웹에선 요소가 너무 커져버리는 부작용이 발생한다.

결국 이는 웹을 기준으로 작업하던 개발자와, 앱 기준으로 피드백을 주던 디자인실 간의 관점 차이에서 비롯된 것이었다.

### 웹과 앱(WebView)의 화면 렌더링 차이
#### 웹 (Web)
- `font-size`, `padding` 등 모든 값이 픽셀 기준 절대값으로 렌더링 된다.
  - 예를 들어, `font-size: 14px`이라면 디바이스 너비가 `360px`이든 `1200px`이든 항상 `14px`로 출력된다.
- `viewport`를 `device-width`로 설정하면 기기 너비에 맞춰 컨텐츠는 줄어들지만, 스타일 값은 그대로 유지된다.

#### 앱 (WebView)
- 전체 화면이 비율 기반으로 확대/축소 된다.
  - 예를 들어, `width=720` 기준 디자인일 때, 실제 디바이스가 `360px`이면 50% 비율로 줄여서 출력된다.
- 마치 이미지를 비율로 맞춰 리사이징하듯 렌더링 되므로, 스타일도 상대적으로 축소된다.

이러한 렌더링 방식 때문에, 디자인실은 모바일 디바이스의 최대 지원 너비를 `720px`로 가정하고 디자인을 진행했다.
앱에서는 실제로 `720px`을 기준으로 스타일이 적용되고, 디바이스 너비에 따라 비율로 축소되어 출력되기 때문에,
해당 기준에 맞춘 디자인이 그대로 출력되어야 디자이너의 의도와 일치한다.

## 문제점 개선을 위한 시도
문제의 원인이 `viewport` 해석 방식 차이임을 파악한 후, 다음과 같은 개선 시도를 거쳤다.

### 1. `meta vieport` 속성 조정
```html
<!-- 기본 설정 -->
<meta name="viewport" content="width=device-width, initial-scale=1, minimum-scale=1">

<!-- 앱 기준 고정 너비 설정 -->
<meta name="viewport" content="width=720">
```
`width=720`을 지정하면 앱처럼 고정된 `720px` 기준으로 렌더링되어 브라우저 상에서도 웹뷰처럼 전체 스타일이 비율로 축소/확대되어 표시된다.

해당 솔루션은 스타일 관련 코드를 따로 조작하지 않아도 우리가 원하는 방향으로 웹뷰를 지원할 수 있는 방법이었으나,
문제는 웹에서 확인한 모바일 에뮬레이터에서는 문제가 없었음에도 불구하고 실제 앱에서 보는 웹뷰에는 디바이스 너비가 고려되지 않은 채 고정된 너비에서 축소/확대되지 않는 다는 것이었다.  
웹뷰를 제공하고 있는 모바일팀에 웹뷰 너비와 관련한 설정에 대해 요청을 드렸으나 모바일에서 제공되고 있는 웹뷰의 글로벌 설정을 건드리기에는 리스크가 있었으므로 다른 방법을 모색하기로 했다.

### 2. 웹뷰에서만 비율 기반 스타일 적용
> `meta`설정 변경없이, CSS에서 비율 계산 방식을 적용하는 방식으로 우회

웹뷰임을 판단할 수 있는 조건을 기준으로 분기하여, `vw` 기반 비율 스타일을 적용해 디바이스 너비 기준으로 크기를 자동 조정할 수 있도록 했다.
```css
/* func.scss */
@function mobile($px) {
    @return calc($px / 720 * 100vw);
}
```

```css
/* vars/button.scss */
@use 'src/styles/breakpoint';

:root {
  /* 모바일 너비 */
  --font-size: 12px;
  --item-padding: 12px;
  --item-min-height: 24px;
  --container-gap: 4px;

  --container-min-height: 36px;

  /* md 이상의 너비 */
  @media (min-width: breakpoint.$media-md) {
    --font-size: 16px;
    --item-padding: 24px;
    --item-min-height: 40px;
    --container-gap: 12px;
  }

  /* lg 이상의 너비 */
  @media (min-width: breakpoint.$media-lg) {
    --font-size: 18px;
  }
}

/* mobile 웹뷰 */
:host-context(.mobile) {
    --font-size: #{ func.mobile(12) };
    --item-padding: #{ func.mobile(12) };
    --item-min-height: #{ func.mobile(24) };
    --container-gap: #{ func.mobile(4) };

    --container-min-height: #{ func.mobile(36) };
}
```
`class`으로 웹뷰 유입을 판단하여 `mobile()`함수를 사용해 `vw`기준으로 스타일을 적용했다.
스타일을 디바이스 너비와 기준 너비에 대한 비율값으로 적용 하는 것은 웹뷰 내의 설정이나 `meta`의 설정을 따로 건드리지 않고도 앱과 동일한 화면을 구현할 수 있었다.
또한 웹 스타일링과 동일한 구조로 유지할 수 있어 중앙 관리가 가능해져 유연한 대응이 가능해진 점도 좋았다.

앱에 대한 이해도가 부족해서 발생한 일이기도 했고 소통도 정말 중요한 것이라는 걸 알게 되었다.  
이번 기회를 통해 모바일 웹뷰에 대한 웹 스타일링에 대한 이해도를 높일 수 있는 경험을 할 수 있어서 좋았다.