# ScanNeo Style Guide

This comprehensive style guide documents all design tokens, patterns, and conventions used in the ScanNeo React application. Use this guide to maintain consistency when building new features or modifying existing components.

## Table of Contents

1. [Brand Colors](#brand-colors)
2. [Typography](#typography)
3. [Spacing System](#spacing-system)
4. [Component Styles](#component-styles)
5. [Form Elements](#form-elements)
6. [Icons](#icons)
7. [Responsive Design](#responsive-design)
8. [State Styles](#state-styles)
9. [Animations](#animations)
10. [Best Practices](#best-practices)

## Brand Colors

### Primary Palette

```css
/* Core Brand Colors */
--bright-green: #00b140; /* Primary CTAs, success states */
--dark-blue-green: #1c2f38; /* Secondary elements, borders */
--lime-green: #a6ce39; /* Accents, hover states */
--deep-blue: #4c4fa3; /* Primary text, headers */
```

### Color Usage

| Color           | Usage                                   | Tailwind Class                          |
| --------------- | --------------------------------------- | --------------------------------------- |
| Bright Green    | Primary buttons, active states, success | `bg-[#00B140]`, `text-[#00B140]`        |
| Dark Blue-Green | Borders, secondary text                 | `border-[#1C2F38]/20`, `text-[#1C2F38]` |
| Lime Green      | Secondary buttons, hover accents        | `bg-[#A6CE39]`, `hover:bg-[#95BD33]`    |
| Deep Blue       | Headers, navigation text                | `text-[#4C4FA3]`                        |

### Extended Palette

```css
/* UI Colors */
--gray-50: #f9fafb; /* Hover backgrounds */
--gray-500: #6b7280; /* Muted text */
--white: #ffffff; /* Content backgrounds */

/* State Colors */
--success: #00b140; /* Same as bright green */
--warning: #f59e0b; /* Amber */
--error: #ef4444; /* Red */
--info: #3b82f6; /* Blue */
```

## Typography

### Font Stack

```css
font-family:
  'Montserrat',
  'Inter',
  -apple-system,
  BlinkMacSystemFont,
  'Segoe UI',
  sans-serif;
```

### Font Weights

- **400 (Regular)**: Body text, descriptions
- **500 (Medium)**: Buttons, navigation items
- **600 (Semibold)**: Section headings, emphasis
- **700 (Bold)**: Page titles, active states

### Text Sizes

```jsx
// Headings
<h1 className="text-3xl font-bold text-[#4C4FA3]">Page Title</h1>
<h2 className="text-2xl font-semibold text-[#4C4FA3]">Section Title</h2>
<h3 className="text-xl font-semibold text-[#4C4FA3]">Subsection</h3>

// Body Text
<p className="text-base text-gray-700">Regular paragraph text</p>
<p className="text-sm text-gray-600">Secondary information</p>
<p className="text-xs text-gray-500">Metadata, timestamps</p>

// Navigation
<span className="text-sm font-medium text-[#4C4FA3]">Nav Item</span>
```

## Spacing System

### Base Unit

The spacing system is based on Tailwind's default scale (1 unit = 0.25rem = 4px).

### Common Spacing Values

| Purpose     | Class          | Value |
| ----------- | -------------- | ----- |
| Tight       | `p-2`, `gap-2` | 8px   |
| Default     | `p-4`, `gap-4` | 16px  |
| Comfortable | `p-6`, `gap-6` | 24px  |
| Spacious    | `p-8`, `gap-8` | 32px  |

### Layout Patterns

```jsx
// Page Container
<div className="p-6 max-w-7xl mx-auto">

// Card Spacing
<div className="bg-white rounded-lg p-4 space-y-4">

// Form Spacing
<form className="space-y-4">
  <div className="space-y-2">
```

## Component Styles

### Buttons

#### Primary Button

```jsx
<button className="bg-[#00B140] hover:bg-[#00A038] text-white font-medium py-2 px-4 rounded-md transition-colors">
  Primary Action
</button>
```

#### Secondary Button

```jsx
<button className="bg-white border border-[#1C2F38]/20 text-[#4C4FA3] hover:bg-gray-50 font-medium py-2 px-4 rounded-md transition-colors">
  Secondary Action
</button>
```

#### Accent Button

```jsx
<button className="bg-[#A6CE39] hover:bg-[#95BD33] text-[#1C2F38] font-medium py-2 px-4 rounded-md transition-colors">
  Special Action
</button>
```

#### Icon Button

```jsx
<button className="p-2 hover:bg-gray-100 rounded-lg transition-colors">
  <Icon className="h-5 w-5 text-[#4C4FA3]" />
</button>
```

### Cards

```jsx
// Basic Card
<div className="bg-white rounded-lg shadow-sm border border-[#1C2F38]/10 p-4">
  {/* Card content */}
</div>

// Interactive Card
<div className="bg-white rounded-lg shadow-sm border border-[#1C2F38]/10 p-4 hover:shadow-md transition-shadow cursor-pointer">
  {/* Card content */}
</div>

// Nested Card
<div className="bg-gray-50 rounded-md p-3 border border-gray-200">
  {/* Nested content */}
</div>
```

### Navigation

```jsx
// Active Nav Item
<a className="flex items-center gap-3 px-3 py-2 rounded-md bg-[#00B140]/10 text-[#4C4FA3] font-bold border-l-[1.5px] border-[#00B140]">
  <Icon className="h-6 w-6" />
  <span>Active Item</span>
</a>

// Inactive Nav Item
<a className="flex items-center gap-3 px-3 py-2 rounded-md hover:bg-gray-50 text-[#4C4FA3] transition-colors">
  <Icon className="h-6 w-6" />
  <span>Inactive Item</span>
</a>
```

## Form Elements

### Text Input

```jsx
<input
  type="text"
  className="w-full border border-[#1C2F38]/20 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#00B140] focus:border-[#00B140] transition-colors"
  placeholder="Enter text..."
/>
```

### Select Dropdown

```jsx
<select className="w-full border border-[#1C2F38]/20 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#00B140] focus:border-[#00B140] transition-colors">
  <option>Option 1</option>
  <option>Option 2</option>
</select>
```

### Checkbox

```jsx
<label className="flex items-center gap-2 cursor-pointer">
  <input
    type="checkbox"
    className="h-4 w-4 text-[#00B140] border-[#1C2F38]/20 rounded focus:ring-[#00B140]"
  />
  <span className="text-sm text-gray-700">Checkbox label</span>
</label>
```

### Form Label

```jsx
<label className="block text-sm font-medium text-[#4C4FA3] mb-1">Field Label</label>
```

## Icons

### Icon Sizes

| Size        | Class     | Usage                           |
| ----------- | --------- | ------------------------------- |
| Extra Small | `h-4 w-4` | Inline with text, small buttons |
| Small       | `h-5 w-5` | Default button icons            |
| Medium      | `h-6 w-6` | Navigation, headers             |
| Large       | `h-8 w-8` | Feature icons, empty states     |

### Icon Colors

```jsx
// Brand colored icon
<Icon className="h-5 w-5 text-[#00B140]" />

// Muted icon
<Icon className="h-5 w-5 text-gray-500" />

// Inherit from parent
<Icon className="h-5 w-5" />
```

## Responsive Design

### Breakpoints

```scss
sm: 640px   // Mobile landscape
md: 768px   // Tablet
lg: 1024px  // Desktop
xl: 1280px  // Large desktop
2xl: 1536px // Extra large
```

### Common Patterns

```jsx
// Hide on mobile
<div className="hidden lg:block">

// Stack on mobile, row on desktop
<div className="flex flex-col lg:flex-row gap-4">

// Responsive padding
<div className="p-4 sm:p-6 lg:p-8">

// Responsive text
<h1 className="text-xl sm:text-2xl lg:text-3xl">
```

## State Styles

### Hover States

```jsx
// Subtle hover
hover:bg-gray-50

// Brand hover
hover:bg-[#00A038]  // Darker green
hover:bg-[#95BD33]  // Darker lime

// Shadow hover
hover:shadow-md
```

### Focus States

```jsx
// Input focus
focus:outline-none focus:ring-2 focus:ring-[#00B140] focus:border-[#00B140]

// Button focus
focus:outline-none focus:ring-2 focus:ring-[#00B140] focus:ring-offset-2
```

### Active States

```jsx
// Active background
bg-[#00B140]/10

// Active text
text-[#4C4FA3] font-bold

// Active border
border-l-[1.5px] border-[#00B140]
```

### Disabled States

```jsx
disabled:opacity-50 disabled:cursor-not-allowed
```

## Animations

### Transitions

```jsx
// Color transitions
transition-colors duration-200

// All properties
transition-all duration-300

// Shadow transitions
transition-shadow duration-200
```

### Common Animations

```jsx
// Fade in
animate-fade-in

// Slide up
animate-slide-up

// Spinner
animate-spin
```

## Best Practices

### 1. Color Usage

- Always use brand colors from the palette
- Use opacity modifiers for subtle variations: `bg-[#00B140]/10`
- Maintain proper contrast ratios for accessibility

### 2. Spacing

- Use consistent spacing scale (2, 4, 6, 8)
- Prefer `gap` over margins for flex/grid layouts
- Use `space-y-*` and `space-x-*` for consistent child spacing

### 3. Typography

- Always specify font weight with font size
- Use Deep Blue (`#4C4FA3`) for primary headings
- Maintain hierarchy with size and weight

### 4. Component Consistency

- Reuse existing component patterns
- Follow established hover/focus/active states
- Maintain consistent border radius (`rounded-md` for most elements)

### 5. Responsive Design

- Design mobile-first
- Use responsive utilities instead of media queries
- Test all breakpoints

### 6. Performance

- Prefer Tailwind utilities over custom CSS
- Use `transition-*` sparingly for better performance
- Avoid unnecessary animations on mobile

### 7. Accessibility

- Ensure proper focus states on all interactive elements
- Maintain color contrast ratios (WCAG AA minimum)
- Use semantic HTML elements

## Code Examples

### Complete Component Example

```jsx
// Well-styled card component
export function FeatureCard({ title, description, icon: Icon, action }) {
  return (
    <div className="bg-white rounded-lg shadow-sm border border-[#1C2F38]/10 p-6 hover:shadow-md transition-shadow">
      <div className="flex items-start gap-4">
        <div className="flex-shrink-0">
          <div className="p-3 bg-[#00B140]/10 rounded-lg">
            <Icon className="h-6 w-6 text-[#00B140]" />
          </div>
        </div>
        <div className="flex-1 space-y-2">
          <h3 className="text-lg font-semibold text-[#4C4FA3]">{title}</h3>
          <p className="text-sm text-gray-600">{description}</p>
          {action && (
            <button className="mt-3 text-sm font-medium text-[#00B140] hover:text-[#00A038] transition-colors">
              {action} →
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
```

### Form Example

```jsx
// Styled form with validation
export function ContactForm() {
  return (
    <form className="space-y-4">
      <div>
        <label className="block text-sm font-medium text-[#4C4FA3] mb-1">Name</label>
        <input
          type="text"
          className="w-full border border-[#1C2F38]/20 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#00B140] focus:border-[#00B140] transition-colors"
          placeholder="Enter your name"
        />
      </div>

      <div>
        <label className="block text-sm font-medium text-[#4C4FA3] mb-1">Message</label>
        <textarea
          className="w-full border border-[#1C2F38]/20 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#00B140] focus:border-[#00B140] transition-colors"
          rows={4}
          placeholder="Enter your message"
        />
      </div>

      <div className="flex gap-3">
        <button
          type="submit"
          className="bg-[#00B140] hover:bg-[#00A038] text-white font-medium py-2 px-4 rounded-md transition-colors"
        >
          Submit
        </button>
        <button
          type="button"
          className="bg-white border border-[#1C2F38]/20 text-[#4C4FA3] hover:bg-gray-50 font-medium py-2 px-4 rounded-md transition-colors"
        >
          Cancel
        </button>
      </div>
    </form>
  );
}
```

## Quick Reference

### Essential Classes

```jsx
// Containers
'max-w-7xl mx-auto p-6';
'bg-white rounded-lg shadow-sm border border-[#1C2F38]/10 p-4';

// Typography
'text-2xl font-semibold text-[#4C4FA3]';
'text-sm text-gray-600';

// Buttons
'bg-[#00B140] hover:bg-[#00A038] text-white font-medium py-2 px-4 rounded-md';

// Forms
'border border-[#1C2F38]/20 rounded-md px-3 py-2 focus:ring-2 focus:ring-[#00B140]';

// Layout
'flex items-center justify-between gap-4';
'grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6';
```

This style guide serves as the single source of truth for all UI decisions in the ScanNeo application. When in doubt, refer to existing components and patterns before creating new ones.
