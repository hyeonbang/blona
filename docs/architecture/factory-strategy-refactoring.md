---
id: factory-strategy-refactoring
title: switch-case 지옥 탈출기
description:  전략 패턴으로 구조 개선하기
sidebar_position: 1
tags:
  - switch-case
  - factory-strategy
  - 조건문
  - 전략패턴
date: 2025-01-03
---
> 2025-01-03, Angular18 기반 프로젝트에서 작성된 사례입니다.
### 개요
카테고리별 컨텐츠를 렌더링 할 때, 각 타입마다 실행해야 할 로직을 `switch-case`문으로 분기하여 처리하는 구조가 있었다.  
이 모든 로직이 하나의 파일에 집중되어 있었고, 10개 남짓에서 시작한 타입은 30개 이상으로 계속 늘어나며, 조건문도 함께 복잡해져 가독성과 유지보수 측면에서 어려움이 있었다.  

이 글에서는 이러한 구조를 개선하기 위해 `Factory-Strategy`패턴을 도입했던 리팩터링 사례를 공유하고자 한다. 
각 타입별 로직을 독립된 전략 클래스로 분리하고, 확장성과 재사용성을 높인 구조로 전환한 과정을 중심으로 설명한다. 

## switch-case 문으로 작성된 카테고리별 로직
카테고리별 컨텐츠를 구성하는 피드 컴포넌트는 다음과 같은 계층 구조로 되어 있었다.

- **MainComponent**: 전체 피드를 구성하는 메인 컴퍼넌트
- **ItemComponent**: 개별 항목을 구성하는 컴퍼넌트
- **ItemContentComponent**: 각 항목의 내용을 구성하는 상세 컴퍼넌트

```html
<!--main.component.html-->
  <app-item *ngFor="let item of items" [item]="item">
    <app-item-content [item]="item"></app-item-content>
  </app-item>
```
각 피드의 항목은 카테고리에 맞는 타입에 따라 다른 형태로 화면에 렌더링되어야 했고, 이로 인해 `ItemComponent`와 `ItemContentComponent`라는 두개의 컴포넌트로 분리되어 있었다.
두 컴포넌트는 동일한 타입 정보를 기반으로, 유사한 데이터를 받아 각기 다른 형태의 UI를 구성했다.
문제는 이 두 컴포넌트가 각자 동일한 타입별 분기 로직을 따로 가지고 있었다는 점이다.

- **ItemComponent**: 리스트 형태의 요약 뷰를 구성
- **ItemContentComponent**: 상세 페이지용 컨텐츠 뷰 구성

### 중복된 분기 로직의 한계
```ts
// item.component.ts
private renderItem1 (item: Item) {
    // Type1에 대한 렌더링 로직
}

private renderItem2 (item: Item) {
    // Type2에 대한 렌더링 로직
}

private renderItem3 (item: Item) {
    // Type3에 대한 렌더링 로직
}

// ...

switch (item.type) {
    case Category.Type1:
        return renderItem1(item);
    case Category.Type2:
        return renderItem2(item);
    case Category.Type3:
        return renderItem3(item);
    // ...
    case Category.Type30:
        return renderItem30(item);
}
```

```ts
// item-content.component.ts
private renderItemContent1 (item: Item) {
    // Type1에 대한 렌더링 로직
}

private renderItemContent2 (item: Item) {
    // Type2에 대한 렌더링 로직
}

private renderItemContent3 (item: Item) {
    // Type3에 대한 렌더링 로직
}

// ...

switch (itemContent.type) {
    case Category.Type1:
        return renderItemContent1(itemContent);
    case Category.Type2:
        return renderItemContent2(itemContent);
    case Category.Type3:
        return renderItemContent3(itemContent);
    // ...
    case Category.Type30:
        return renderItemContent30(itemContent);
}
```

하지만 내부에서는 같은 타입에 대한 로직을 각각 별도의 `switch-case`문으로 구현하고 있었고, 이로 인해 다음과 같은 비효율이 발생했다.
- 같은 타입에 대한 처리 로직을 두번 작성해야 함
- 새로운 타입이 추가될 때마다 두 컴포넌트 모두에 조건문을 수정해야 함
- 중복 로직으로 인해 버그 발생 가능성 증가 및 유지보수 비용이 올라감
 
### 개선 방향에 대한 고민
이 구조는 자연스럽게 중복과 분기가 늘어나는 문제를 발생시키고, 궁극적으로는 공통 처리 로직을 한 곳에서 관리할 필요성을 느꼈다.
이러한 문제점을 해결하고자 아래와 같은 목표를 정하고, 새로운 구조를 생각해보기로 했다.
- 코드의 모듈화: 각 `type`에 대한 로직을 독립된 클래스로 분리.
- 유지보수성 향상: 새로운 타입이 추가 되더라도 기존 코드를 수정하지 않고 확장이 가능하도록 설계
- 재사용성 확보: 다른 컴퍼넌트에서도 동일한 로직을 재사용할 수 있도록 구조화

## Factory-Strategy 패턴 도입
개선 방향에 대한 고민을 바탕으로, `Factory-Strategy` 패턴을 도입하기로 했다.  
각 타입별 로직을 독립된 전략 클래스(`Strategey`)로 분리하고, 이를 관리하는 `Factory`객체를 통해 실행 흐름을 구성했다.
- `Strategy` 패턴: 타입별 로직을 각각의 전략 클래스에서 처리
- `Factory` 패턴: 타입에 맞는 전략 객체를 생성하고 반환

### Strategy 인터페이스 정의
모든 전략(`Strategy`)은 공통된 메서드를 구현하도록 인터페이스를 정의하고, `extraDependency`를 통해 필요한 의존성을 주입받도록 했다.
```ts
// item-strategy.interface.ts
export interface ItemStrategy {
    handleItem(
        data: MainData,
        extraDependency?: ItemExtraDependency
        // ...
    ): Item;
    
    handleItemContent?(
        data: MainData,
        extraDependency?: ItemExtraDependency
        // ...
    ): ItemContent;
}
```
`ItemStrategy`는 타입에 따라 달라지는 데이터 처리 및 렌더링 로직을 전략별로 분리하여,  
이를 통해 `ItemComponent`나 `ItemContentComponent`에서는 **타입에 따라 어떤 전략을 사용할지**만 결정하도록 했다.  
실제 처리 로직은 각 전략 클래스에서 담당하게 된다.

### 타입 별 Strategy 구현
각 타입별로 개별적인 로직을 처리하는 `Strategy` 클래스를 생성했다.
```ts
// strategies/type1.strategy.ts
export class Type1Strategy implements ItemStrategy {  
    handleItem(data: MainData): Item {  
        const title = 'Type 1';
        const content = data.content as ItemType1;
        return { title, content };  
    }  
  
    async handleItemContent(data: MainData, extraDependency?: ItemExtraDependency): Promise<ItemContent> {
        const title = 'Type 1 - Content';
        const content = await extraDependency.dataService.getType1Content(data);
  
        return { title, content };  
    }  
}  
```

### Factory 구현
타입에 따라 적절한 `Strategy` 객체를 생성하는 `Factory`를 구현했다.
```typescript
// item-strategy.factory.ts
export class ItemStrategyFactory {  
    private static strategies = new Map<Category, ItemStrategy>([  
        [Category.Type1, new Type1Strategy()],  
        [Category.Type2, new Type2Strategy()],  
        [Category.Type3, new Type3Strategy()],  
        // ...
        [Category.Type15, new Type3Strategy()], // 같은 전략을 취하는 경우 컴포넌트 재활용도 가능하다.
        // ...
        [Category.Type30, new Type30Strategy()],
    ]);  
  
    static getStrategy(type: Category): ItemStrategy | null {  
        return this.strategies.get(type) || null;  
    }  
}
```

### Factory를 통해 전략 호출
`ItemComponent`에서 `Factory`를 활용하여 타입에 따라 `Strategy`를 생성하고, 전략 메서드를 호출하여 데이터 및 UI를 렌더링하도록 했다.
```ts
// item.component.ts
private setItem() {  
    const strategy = ItemStrategyFactory.getStrategy(this.data.type);  
    if (!strategy || !strategy?.handleItem) return;  
  
    this.item = strategy.handleItem(this.data);  
  
    this.changeDetectorRef.detectChanges(); // UI 업데이트를 위해 변경 감지 수행
}
```

`ItemContentComponent`에서 역시 `Factory`를 활용하여 타입에 따라 `Strategy`를 생성하고, 해당 컴포넌트에 대한 전략 메서드를 호출하여 데이터 및 UI를 렌더링하도록 했다.
```ts
// item-content.component.ts
private async setItemContent() {   
    const strategy = ItemStrategyFactory.getStrategy(this.data.type);  
    if (!strategy || !strategy?.handleItemContent) return;  
  
    const extraDependency: ItemExtraDependency = {
        dataService: this.dataService,
        // ...
    };  
  
    this.itemContent = await strategy.handleItemContent(  
        this.data,  
        extraDependency  
    );  
  
    this.changeDetectorRef.detectChanges();  
}
```
`handleItemContent()`처럼 비동기 데이터가 필요한 전략에서는 외부 서비스를 주입받아 사용한다.
이를 위해 `extraDependency`객체에 필요한 서비스 인스턴스를 담아 전달한다.

## 구조 개선 결과
1. **코드 모듈화**: 각 `type`의 로직을 개별 `Strategy`로 분리해 가독성이 향상되었다.
2. **유지보수성 향상**: 새로운 타입이 추가되더라도 기존 코드를 수정하지 않고 확장이 가능해졌다.
3. **확장성 강화**: 다른 컴포넌트에서도 동일한 로직을 재사용할 수 있도록 구조화되었다.
4. **단일 책임 원칙 준수**: 각 전략 클래스는 오직 하나의 책임만을 가지게 되어, 코드의 의도가 명확해졌다.

이번 리팩터링을 통해 `Factory-Strategy` 패턴을 도입해보며 답답한 `switch-case`문을 탈출하고 동굴 끝을 찾은 것만 같은 후련함을 느꼈다.  
서비스 구조상, 여러 타입이 동일한 인터페이스를 통해 서로 다른 동작을 수행해야하는 상황이었고, 기존에는 이 모든 분기 로직이 하나의 컴포넌트 안에서 `switch-case`문으로 처리되고 있었다.

전략 패턴을 도입하면서 각 타입별 로직은 독립된 전략 객체에 정의하여 같은 비지니스 로직끼리 통합시키고, 컴포넌트는 단지 해당 전략을 선택하고 실행만 하면 되는 구조로 개선되었다.  
코드가 길어질 걱정도 없고, 한 번 쓰고 버려지는 로직이 아닌 재활용 가능한 형태로 관리될 수 있게 되었다.  

물론, 타입이 추가될 때마다 전략 객체를 하나씩 만들어야 한다는 점,  
그리고 특정 타입이 기존 전략들과 너무 다른 경우 인터페이스의 확장이 필요하다는 점은 단점으로 남는다.  
하지만 이는 복잡도를 구조적으로 분산시키는 것이며, **기존 구조보다 훨씬 유연하고 확장 가능한 방식**이라고 느꼈다.

이번 경험은 단순히 새로운 프로젝트를 만드는 것과 달리, 기존의 문제를 정확히 파악하고 그것을 구조적으로 개선하기 위한 설계적 고민이 수반된 리팩터링이었다.  
앞으로도 유사한 상황에서 더 나은 선택을 할 수 있는 기반이 되었다고 생각한다.
