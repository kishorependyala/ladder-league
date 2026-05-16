import { render, screen } from '@testing-library/react';
import App from './App';

test('renders ladder league auth flow', () => {
  render(<App />);
  expect(screen.getByText(/ladder league/i)).toBeInTheDocument();
  expect(screen.getByText(/compete\. track\. dominate\./i)).toBeInTheDocument();
});
