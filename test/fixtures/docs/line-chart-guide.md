## Installation

Install via npm or yarn:

```bash
npm install @antv/context
```

Or with yarn:

```bash
yarn add @antv/context
```


## Quick Start

```typescript
import { Context } from '@antv/context';

const ctx = await Context.create({ vectorsDir: './vectors' });
await ctx.load('g2', './docs/**/*.md');
const results = await ctx.query('How to configure a line chart', { library: 'g2', topK: 5 });
```


## Line Chart Configuration

### Basic Line Chart

To create a basic line chart, use the `line()` method on the chart instance:

```typescript
chart.line()
  .position('date*price')
  .color('category')
  .size(2);
```

The position channel maps `date` to the x-axis and `price` to the y-axis.
The color channel differentiates lines by the `category` field.

### Line Chart with Tooltip

Tooltips display detailed information when hovering over data points.
Configure tooltips using the `tooltip()` method:

```typescript
chart.tooltip({
  showCrosshairs: true,
  shared: true,
  fields: ['date', 'price', 'volume'],
  formatter: (datum) => ({
    name: datum.category,
    value: datum.price.toFixed(2)
  })
});
```

The `showCrosshairs` option draws vertical and horizontal guide lines.
Set `shared: true` to merge tooltip items from all series at the same x position.

### Line Chart with Animation

Enable animations to make your charts more engaging:

```typescript
chart.animate({
  enter: {
    type: 'pathIn',
    duration: 1000,
    easing: 'easeCubicOut'
  },
  update: {
    type: 'morph',
    duration: 500
  }
});
```

Enter animations play when data points first appear.
Update animations interpolate between old and new positions when data changes.


## Advanced Configuration

### Custom Axis Labels

Customize axis labels using the `axis()` method:

```typescript
chart.axis('price', {
  title: { text: 'Price (USD)' },
  label: {
    formatter: (val) => `$${val}`,
    autoRotate: true
  }
});
```

### Legend Configuration

Control legend appearance with the `legend()` method:

```typescript
chart.legend('category', {
  position: 'top',
  marker: { symbol: 'circle', size: 8 },
  itemName: { style: { fontSize: 12 } }
});
```

### Responsive Design

Create responsive charts that adapt to container size changes:

```typescript
chart.forceFit();
window.addEventListener('resize', () => {
  chart.forceFit();
});
```
