import type UserRepresentation from "@keycloak/keycloak-admin-client/lib/defs/userRepresentation";
import {
  AlertVariant,
  ButtonVariant,
  DropdownItem,
  PageSection,
  Tab,
  TabTitleText,
} from "@patternfly/react-core";
import { useState } from "react";
import { FormProvider, useForm } from "react-hook-form";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router-dom";

import { useAlerts } from "../components/alert/Alerts";
import { useConfirmDialog } from "../components/confirm-dialog/ConfirmDialog";
import { KeycloakSpinner } from "../components/keycloak-spinner/KeycloakSpinner";
import {
  RoutableTabs,
  useRoutableTab,
} from "../components/routable-tabs/RoutableTabs";
import { ViewHeader } from "../components/view-header/ViewHeader";
import { useAdminClient, useFetch } from "../context/auth/AdminClient";
import { useRealm } from "../context/realm-context/RealmContext";
import { UserProfileProvider } from "../realm-settings/user-profile/UserProfileContext";
import { useParams } from "../utils/useParams";
import { useUpdateEffect } from "../utils/useUpdateEffect";
import { UserCredentials } from "./UserCredentials";
import { BruteForced, UserForm } from "./UserForm";
import {
  isUserProfileError,
  userProfileErrorToString,
} from "./UserProfileFields";
import { UserParams, UserTab, toUser } from "./routes/User";
import { toUsers } from "./routes/Users";

import "./user-section.css";

export default function EditUser() {
  const { adminClient } = useAdminClient();
  const { realm } = useRealm();
  const { id } = useParams<UserParams>();
  const { t } = useTranslation("users");
  const [user, setUser] = useState<UserRepresentation>();
  const [isServiceUser, setIsServiceUser] = useState<boolean>(false);
  const [bruteForced, setBruteForced] = useState<BruteForced>();
  const [refreshCount, setRefreshCount] = useState(0);
  const refresh = () => setRefreshCount((count) => count + 1);

  useFetch(
    async () => {
      const [user, currentRealm, attackDetection] = await Promise.all([
        adminClient.users.findOne({ id: id! }),
        adminClient.realms.findOne({ realm }),
        adminClient.attackDetection.findOne({ id: id! }),
      ]);

      if (!user || !currentRealm || !attackDetection) {
        throw new Error(t("common:notFound"));
      }

      const isBruteForceProtected = currentRealm.bruteForceProtected;
      const isLocked = isBruteForceProtected && attackDetection.disabled;

      const serviceUsers =
        ((await adminClient.roles.findUsersWithRole({
          name: "service",
        })) as UserRepresentation[] | null) ?? ([] as UserRepresentation[]);

      return {
        user,
        bruteForced: { isBruteForceProtected, isLocked },
        isServiceUser: serviceUsers.some(
          (serviceUser) => serviceUser.id === user.id
        ),
      };
    },
    ({ user, bruteForced, isServiceUser }) => {
      setUser(user);
      setBruteForced(bruteForced);
      setIsServiceUser(isServiceUser);
    },
    [refreshCount]
  );

  if (!user || !bruteForced) {
    return <KeycloakSpinner />;
  }

  return (
    <EditUserForm
      user={user}
      bruteForced={bruteForced}
      refresh={refresh}
      isServiceUser={isServiceUser}
    />
  );
}

type EditUserFormProps = {
  user: UserRepresentation;
  bruteForced: BruteForced;
  isServiceUser: boolean;
  refresh: () => void;
};

const EditUserForm = ({
  user,
  bruteForced,
  isServiceUser,
  refresh,
}: EditUserFormProps) => {
  const { t } = useTranslation("users");
  const { realm } = useRealm();
  const { adminClient } = useAdminClient();
  const { addAlert, addError } = useAlerts();
  const navigate = useNavigate();
  const userForm = useForm<UserRepresentation>({
    mode: "onChange",
    defaultValues: user,
  });

  const toTab = (tab: UserTab) =>
    toUser({
      realm,
      id: user.id!,
      tab,
    });

  const useTab = (tab: UserTab) => useRoutableTab(toTab(tab));

  const settingsTab = useTab("settings");
  const credentialsTab = useTab("credentials");

  // Ensure the form remains up-to-date when the user is updated.
  useUpdateEffect(() => userForm.reset(user), [user]);

  const save = async (formUser: UserRepresentation) => {
    if (formUser.username === "service") return;
    try {
      await adminClient.users.update(
        { id: user.id! },
        {
          ...formUser,
          username: formUser.username?.trim(),
          attributes: { ...user.attributes, ...formUser.attributes },
        }
      );
      addAlert(t("userSaved"), AlertVariant.success);
      refresh();
    } catch (error) {
      if (isUserProfileError(error)) {
        addError(userProfileErrorToString(error), error);
      } else {
        addError("users:userCreateError", error);
      }
    }
  };

  const [toggleDeleteDialog, DeleteConfirm] = useConfirmDialog({
    titleKey: "users:deleteConfirm",
    messageKey: "users:deleteConfirmCurrentUser",
    continueButtonLabel: "common:delete",
    continueButtonVariant: ButtonVariant.danger,
    onConfirm: async () => {
      try {
        await adminClient.users.del({ id: user.id! });
        addAlert(t("userDeletedSuccess"), AlertVariant.success);
        navigate(toUsers({ realm }));
      } catch (error) {
        addError("users:userDeletedError", error);
      }
    },
  });

  const [toggleImpersonateDialog, ImpersonateConfirm] = useConfirmDialog({
    titleKey: "users:impersonateConfirm",
    messageKey: "users:impersonateConfirmDialog",
    continueButtonLabel: "users:impersonate",
    onConfirm: async () => {
      try {
        const data = await adminClient.users.impersonation(
          { id: user.id! },
          { user: user.id!, realm }
        );
        if (data.sameRealm) {
          window.location = data.redirect;
        } else {
          window.open(data.redirect, "_blank");
        }
      } catch (error) {
        addError("users:impersonateError", error);
      }
    },
  });

  return (
    <>
      <ImpersonateConfirm />
      <DeleteConfirm />
      {!isServiceUser && (
        <ViewHeader
          titleKey={user.username!}
          className="kc-username-view-header"
          divider={false}
          dropdownItems={[
            <DropdownItem
              key="impersonate"
              isDisabled={!user.access?.impersonate}
              onClick={() => toggleImpersonateDialog()}
            >
              {t("impersonate")}
            </DropdownItem>,
            ...(user.username?.toLowerCase() === "default"
              ? []
              : [
                  <DropdownItem
                    key="delete"
                    isDisabled={!user.access?.manage}
                    onClick={() => toggleDeleteDialog()}
                  >
                    {t("common:delete")}
                  </DropdownItem>,
                ]),
          ]}
          onToggle={(value) => save({ ...user, enabled: value })}
          isEnabled={user.enabled}
          isReadOnly={user.username?.toLowerCase() == "default" && user.enabled}
        />
      )}

      <PageSection variant="light" className="pf-u-p-0">
        <UserProfileProvider>
          <FormProvider {...userForm}>
            <RoutableTabs
              isBox={false}
              mountOnEnter
              defaultLocation={toTab("settings")}
            >
              <Tab
                data-testid="user-details-tab"
                title={<TabTitleText>{t("common:details")}</TabTitleText>}
                {...settingsTab}
              >
                <PageSection variant="light">
                  <UserForm
                    save={save}
                    user={user}
                    bruteForce={bruteForced}
                    isServiceUser={isServiceUser}
                  />
                </PageSection>
              </Tab>
              {!isServiceUser && (
                <Tab
                  data-testid="credentials"
                  isHidden={!user.access?.view}
                  title={<TabTitleText>{t("common:credentials")}</TabTitleText>}
                  {...credentialsTab}
                >
                  <UserCredentials user={user} />
                </Tab>
              )}
            </RoutableTabs>
          </FormProvider>
        </UserProfileProvider>
      </PageSection>
    </>
  );
};
