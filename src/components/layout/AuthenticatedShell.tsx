import { useCallback, useMemo, useState } from 'react';
import { Outlet, useNavigate } from 'react-router-dom';
import type { NavigationItem } from '@solvera/pace-core/components';
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogHeader,
  DialogTitle,
  LoadingSpinner,
  PaceAppLayout,
  PasswordChangeForm,
  ToastProvider,
} from '@solvera/pace-core/components';
import { useCan } from '@solvera/pace-core/rbac';
import { useUnifiedAuth } from '@solvera/pace-core/hooks';
import { APP_NAME } from '@/appName';
import { PUMP_NAV_ITEMS } from '@/config/navItems';
import { CommRbacContextProvider } from '@/components/comms/CommRbacContextProvider';

function usePumpNavItems(allItems: NavigationItem[]): NavigationItem[] {
  const { can: canReadCommsLog, isLoading: readLogLoading } = useCan('read:page.CommsLog');
  const { can: canCompose, isLoading: composeLoading } = useCan('create:page.CommsLog');
  const { can: canReadTemplates, isLoading: templatesLoading } = useCan('read:page.CommsTemplates');

  return useMemo(() => {
    if (readLogLoading || composeLoading || templatesLoading) {
      return [];
    }

    return allItems.filter((item) => {
      if (item.id === 'comms-log') {
        return canReadCommsLog;
      }
      if (item.id === 'compose') {
        return canCompose;
      }
      if (item.id === 'templates') {
        return canReadTemplates;
      }
      return false;
    });
  }, [
    allItems,
    canReadCommsLog,
    canCompose,
    canReadTemplates,
    readLogLoading,
    composeLoading,
    templatesLoading,
  ]);
}

function deriveUserFullName(
  user: ReturnType<typeof useUnifiedAuth>['user']
): string {
  const metadataName =
    typeof user?.user_metadata?.full_name === 'string'
      ? user.user_metadata.full_name
      : null;
  if (metadataName != null && metadataName.trim().length > 0) {
    return metadataName;
  }
  if (typeof user?.email === 'string' && user.email.length > 0) {
    return user.email;
  }
  return 'Authenticated user';
}

function ChangePasswordDialog({
  open,
  onOpenChange,
  onSubmit,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSubmit: (newPassword: string) => Promise<{ error?: { message: string } }>;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Change password</DialogTitle>
        </DialogHeader>
        <DialogBody>
          <PasswordChangeForm
            onSubmit={async ({ newPassword }) => onSubmit(newPassword)}
            onSuccess={() => onOpenChange(false)}
            onCancel={() => onOpenChange(false)}
          />
        </DialogBody>
      </DialogContent>
    </Dialog>
  );
}

export function AuthenticatedShell() {
  const navigate = useNavigate();
  const { isLoading, user, selectedOrganisation, signOut, updatePassword } = useUnifiedAuth();
  const [passwordDialogOpen, setPasswordDialogOpen] = useState(false);
  const visibleNavItems = usePumpNavItems(PUMP_NAV_ITEMS);

  const userFullName = useMemo(() => deriveUserFullName(user), [user]);
  const userEmail = user?.email ?? 'No email available';

  const handleUserMenuSignOut = useCallback(async () => {
    await signOut();
    navigate('/login', { replace: true });
  }, [navigate, signOut]);

  const handlePasswordSubmit = useCallback(
    async (newPassword: string) => {
      return updatePassword(newPassword);
    },
    [updatePassword]
  );

  const passwordDialog = (
    <ChangePasswordDialog
      open={passwordDialogOpen}
      onOpenChange={setPasswordDialogOpen}
      onSubmit={handlePasswordSubmit}
    />
  );

  if (isLoading) {
    return (
      <ToastProvider>
        <main className="grid min-h-screen place-items-center">
          <LoadingSpinner />
        </main>
      </ToastProvider>
    );
  }

  if (selectedOrganisation == null) {
    return (
      <ToastProvider>
        <PaceAppLayout
          appName={APP_NAME}
          navItems={visibleNavItems}
          showOrganisations
          showEvents={false}
          enforcePermissions={false}
          userFullName={userFullName}
          userEmail={userEmail}
          onUserMenuSignOut={handleUserMenuSignOut}
          onUserMenuChangePassword={() => setPasswordDialogOpen(true)}
        >
          <main className="grid min-h-[60vh] place-items-center">
            <section>
              <p>No organisation assigned. Please contact your administrator.</p>
            </section>
          </main>
          {passwordDialog}
        </PaceAppLayout>
      </ToastProvider>
    );
  }

  return (
    <ToastProvider>
      <PaceAppLayout
        appName={APP_NAME}
        navItems={visibleNavItems}
        showOrganisations
        showEvents={false}
        enforcePermissions={false}
        userFullName={userFullName}
        userEmail={userEmail}
        onUserMenuSignOut={handleUserMenuSignOut}
        onUserMenuChangePassword={() => setPasswordDialogOpen(true)}
      >
        <CommRbacContextProvider>
          <Outlet />
        </CommRbacContextProvider>
        {passwordDialog}
      </PaceAppLayout>
    </ToastProvider>
  );
}
