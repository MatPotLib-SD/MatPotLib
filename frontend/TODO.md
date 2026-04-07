# Frontend TODO

## Temporary Navigation Solutions (need to be reprogrammed)

- **SignUpScreen "Create Account" button** currently navigates directly to `QuizExperience` for testing. Should instead submit the form, create the user account via the auth backend, and only then navigate into the quiz flow.
- **SignInScreen "Sign In" button** has no real auth wired up. Needs to call the login endpoint and on success `navigation.reset` to the home screen (clearing the stack so no back button appears).
- **QuizPlantsScreen "Get Started" button** has a TODO placeholder — should `navigation.reset` to the home screen once it exists and persist the quiz answers to the backend/user profile.
- **Stack navigator in `App.tsx`** currently starts at `SignUp`. Once auth is implemented, the initial route should depend on whether the user is logged in (and whether they've completed the onboarding quiz).

## Screens to Build

### Core
- [ ] Home screen (dashboard / plant overview)
- [ ] Plant data screen (individual plant details, sensor readings, history)
- [ ] Alerts screen (notifications, watering reminders, health warnings)

### Settings
- [ ] Settings home screen
- [ ] Account / profile screen (edit name, email, password)
- [ ] Notification preferences screen
- [ ] Connected devices screen (BLE pot pairing/management)
- [ ] Appearance / theme screen
- [ ] Privacy & data screen
- [ ] Help & support screen
- [ ] About screen (app version, credits)
- [ ] Sign out action
