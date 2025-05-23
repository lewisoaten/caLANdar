import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import moment from 'moment';
import EventsAdminDialog from './EventsAdminDialog';
import { EventData, defaultEventData } from '../types/events';
import { UserContext, UserDispatchContext } from '../UserProvider';

// Mock fetch
global.fetch = jest.fn();

const mockSignOut = jest.fn();

const mockUserContextValue = {
  token: 'test-token',
  name: 'Test User',
  email: 'test@example.com',
  isAuthenticated: true,
  isAdmin: true,
  isFirstLogin: false,
  profile: null,
};

const mockUserDispatchContextValue = {
  signIn: jest.fn(),
  signOut: mockSignOut,
  refreshUser: jest.fn(),
};

const renderWithProviders = (ui: React.ReactElement) => {
  return render(
    <UserContext.Provider value={mockUserContextValue}>
      <UserDispatchContext.Provider value={mockUserDispatchContextValue}>
        {ui}
      </UserDispatchContext.Provider>
    </UserContext.Provider>
  );
};

describe('EventsAdminDialog', () => {
  const mockOnClose = jest.fn();

  const mockExistingEvent: EventData = {
    ...defaultEventData, // Ensure all default fields are present
    id: 1,
    title: 'Existing Test Event',
    description: 'This is an existing event.',
    timeBegin: moment().add(1, 'days').startOf('hour'),
    timeEnd: moment().add(1, 'days').add(3, 'hours').startOf('hour'),
    image: null, // Or some base64 string
    createdAt: moment(),
    lastModified: moment(),
  };

  beforeEach(() => {
    jest.clearAllMocks();
    // Reset fetch mock for each test
    (global.fetch as jest.Mock).mockReset();
  });

  test('renders for creating a new event and saves data via API', async () => {
    const newEventData: EventData = {
      ...defaultEventData,
      id: 2, // ID from API response
      title: 'New Test Event',
      description: 'A cool new event description.',
      timeBegin: moment().add(2, 'days').startOf('hour'),
      timeEnd: moment().add(2, 'days').add(2, 'hours').startOf('hour'),
      createdAt: moment(),
      lastModified: moment(),
    };

    (global.fetch as jest.Mock).mockResolvedValueOnce({
      ok: true,
      status: 201,
      text: () => Promise.resolve(JSON.stringify(newEventData)), // fetch response.text() then JSON.parse
      json: () => Promise.resolve(newEventData), // If component uses .json() directly
    });

    renderWithProviders(<EventsAdminDialog open={true} onClose={mockOnClose} />);

    expect(screen.getByText('Create/Edit Event')).toBeInTheDocument();

    await userEvent.type(screen.getByLabelText(/Title/i), newEventData.title);
    await userEvent.type(screen.getByLabelText(/Description/i), newEventData.description);
    
    // For MUI DateTimePicker, direct input typing is tricky.
    // We'll focus on the save action and mock API for now.
    // A more robust way would be to interact with calendar/clock popups.
    // For simplicity in this context, we assume timeBegin/timeEnd are handled by state changes
    // that would be triggered by interacting with DateTimePicker, which is hard to simulate here without deep MUI knowledge.
    // The component initializes timeBegin/timeEnd to defaultEventData or event prop.
    // If we were to test date changes, we would need to simulate those specific interactions.
    // For now, let's assume the default or initial dates are used if not changed.

    await act(async () => {
        fireEvent.submit(screen.getByRole('button', { name: /Create/i }));
    });
    
    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledTimes(1);
      expect(global.fetch).toHaveBeenCalledWith(
        '/api/events?as_admin=true',
        expect.objectContaining({
          method: 'POST',
          headers: expect.objectContaining({
            'Content-Type': 'application/json',
            Authorization: `Bearer ${mockUserContextValue.token}`,
          }),
          body: JSON.stringify({
            title: newEventData.title,
            description: newEventData.description,
            // timeBegin and timeEnd would be from formValues state, which defaults or is set by DateTimePicker
            // For this test, they will be the defaultEventData values unless explicitly changed
            timeBegin: defaultEventData.timeBegin.toISOString(), // Ensure it's ISO string as per typical API contract
            timeEnd: defaultEventData.timeEnd.toISOString(),
          }),
        })
      );
    });
    
    await waitFor(() => {
        // The component calls onClose with the data from the API response
        expect(mockOnClose).toHaveBeenCalledWith(expect.objectContaining({
            id: newEventData.id,
            title: newEventData.title,
        }));
    });
  });

  test('renders for editing an existing event and saves updated data via API', async () => {
    const updatedTitle = 'Updated Existing Event';
    (global.fetch as jest.Mock).mockResolvedValueOnce({
      ok: true,
      status: 204, // PUT usually returns 204 No Content
    });
  
    renderWithProviders(
      <EventsAdminDialog open={true} onClose={mockOnClose} event={mockExistingEvent} />
    );
  
    expect(screen.getByLabelText(/Title/i)).toHaveValue(mockExistingEvent.title);
    await userEvent.clear(screen.getByLabelText(/Title/i));
    await userEvent.type(screen.getByLabelText(/Title/i), updatedTitle);
  
    await act(async () => {
        fireEvent.submit(screen.getByRole('button', { name: /Create/i })); // Button text is always "Create"
    });
  
    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledTimes(1);
      expect(global.fetch).toHaveBeenCalledWith(
        `/api/events/${mockExistingEvent.id}?as_admin=true`,
        expect.objectContaining({
          method: 'PUT',
          headers: expect.objectContaining({
            'Content-Type': 'application/json',
            Authorization: `Bearer ${mockUserContextValue.token}`,
          }),
          body: JSON.stringify({ // formValues will contain the updated title and original other fields
            ...mockExistingEvent,
            // Dates from mockExistingEvent are Moment objects, ensure they are stringified if that's what API expects
            timeBegin: mockExistingEvent.timeBegin.toISOString(), 
            timeEnd: mockExistingEvent.timeEnd.toISOString(),
            createdAt: mockExistingEvent.createdAt.toISOString(),
            lastModified: mockExistingEvent.lastModified.toISOString(),
            title: updatedTitle,
          }),
        })
      );
    });

    await waitFor(() => {
        // In edit mode, upon successful PUT (204), it calls onClose with the formValues
        expect(mockOnClose).toHaveBeenCalledWith(expect.objectContaining({
          id: mockExistingEvent.id,
          title: updatedTitle,
        }));
      });
  });

  test('calls onClose with no arguments when cancel button is clicked', async () => {
    renderWithProviders(<EventsAdminDialog open={true} onClose={mockOnClose} />);
    
    await userEvent.click(screen.getByRole('button', { name: /Cancel/i }));
    
    expect(mockOnClose).toHaveBeenCalledTimes(1);
    expect(mockOnClose).toHaveBeenCalledWith(); // Called with no arguments
    expect(global.fetch).not.toHaveBeenCalled();
  });

  test('handles API error during save (e.g., 400 Bad Request) in create mode', async () => {
    const originalAlert = window.alert;
    window.alert = jest.fn(); // Mock window.alert

    (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: false, // ok: false for non-2xx responses
        status: 400,
        text: () => Promise.resolve("Bad Request Data"), // Simulate error text
        // No json method for this mock as component checks response.status first
    });

    renderWithProviders(<EventsAdminDialog open={true} onClose={mockOnClose} />);

    await userEvent.type(screen.getByLabelText(/Title/i), "Test Error Event");
    // ... fill other fields as needed ...

    await act(async () => {
        fireEvent.submit(screen.getByRole('button', { name: /Create/i }));
    });
    
    await waitFor(() => {
        expect(global.fetch).toHaveBeenCalledTimes(1);
    });
    
    expect(window.alert).toHaveBeenCalledWith("Invalid event data.");
    expect(mockOnClose).not.toHaveBeenCalled();

    window.alert = originalAlert; // Restore original alert
  });

  test('handles 401 Unauthorized and calls signOut in create mode', async () => {
    (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: false,
        status: 401,
        text: () => Promise.resolve("Unauthorized"),
    });

    renderWithProviders(<EventsAdminDialog open={true} onClose={mockOnClose} />);
    
    await userEvent.type(screen.getByLabelText(/Title/i), "Test Auth Event");

    await act(async () => {
        fireEvent.submit(screen.getByRole('button', { name: /Create/i }));
    });

    await waitFor(() => {
        expect(global.fetch).toHaveBeenCalledTimes(1);
    });

    expect(mockSignOut).toHaveBeenCalledTimes(1);
    expect(mockOnClose).not.toHaveBeenCalled();
  });
});
