import { AlertVariant, PageSection } from "@patternfly/react-core";
import { FormProvider, useForm } from "react-hook-form";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router-dom";

import { useAlerts } from "../components/alert/Alerts";
import { ViewHeader } from "../components/view-header/ViewHeader";
import { useAdminClient, useFetch } from "../context/auth/AdminClient";
import { useRealm } from "../context/realm-context/RealmContext";
import { UserProfileProvider } from "../realm-settings/user-profile/UserProfileContext";
import { toUser } from "./routes/User";
import { UserForm, UserFormSaveResponse } from "./UserForm";
import {
  isUserProfileError,
  userProfileErrorToString,
} from "./UserProfileFields";

import "./user-section.css";
import { getAvailableRoles } from "../components/role-mapping/queries";
import { useState } from "react";
import RoleRepresentation, {
  RoleMappingPayload,
} from "@keycloak/keycloak-admin-client/lib/defs/roleRepresentation";

export default function CreateUser() {
  const { t } = useTranslation("users");
  const { addAlert, addError } = useAlerts();
  const navigate = useNavigate();
  const { adminClient } = useAdminClient();
  const { realm } = useRealm();
  const userForm = useForm<UserFormSaveResponse>({
    mode: "onChange",
    defaultValues: { temporaryPassword: "harmony" },
  });

  const [harmonyAdminRole, setHarmonyAdminRole] =
    useState<RoleRepresentation>();
  const [harmonyUserRole, setHarmonyUserRole] = useState<RoleRepresentation>();

  useFetch(
    () => getAvailableRoles(adminClient, "roles", {}),
    (response) => {
      const roles = response.map(({ role }) => role);
      setHarmonyAdminRole(
        roles.find(
          (role) => role.name === "administrator"
        ) as RoleRepresentation
      );

      setHarmonyUserRole(
        roles.find((role) => role.name === "Harmony-user") as RoleRepresentation
      );
    },
    []
  );

  const save = async (formUser: UserFormSaveResponse) => {
    try {
      const { temporaryPassword, isAdmin = false, ...user } = formUser;
      if (user.username === "service") return;
      const createdUser = await adminClient.users.create({
        ...user,
        username: formUser.username?.trim(),
        groups: [],
        enabled: true,
        credentials: [
          {
            temporary: true,
            type: "password",
            value: temporaryPassword,
          },
        ],
      });

      const rolesToAssign: RoleMappingPayload[] = [];
      if (harmonyUserRole)
        rolesToAssign.push(harmonyUserRole as RoleMappingPayload);
      if (harmonyAdminRole && isAdmin)
        rolesToAssign.push(harmonyAdminRole as RoleMappingPayload);

      await adminClient.users.addRealmRoleMappings({
        id: createdUser.id,
        roles: rolesToAssign,
      });

      addAlert(t("userCreated"), AlertVariant.success);
      navigate(toUser({ id: createdUser.id, realm, tab: "settings" }));
    } catch (error) {
      if (isUserProfileError(error)) {
        addError(userProfileErrorToString(error), error);
      } else {
        addError("users:userCreateError", error);
      }
    }
  };

  return (
    <>
      <ViewHeader
        titleKey={t("createUser")}
        className="kc-username-view-header"
      />
      <PageSection variant="light" className="pf-u-p-0">
        <UserProfileProvider>
          <FormProvider {...userForm}>
            <PageSection variant="light">
              <UserForm save={save} />
            </PageSection>
          </FormProvider>
        </UserProfileProvider>
      </PageSection>
    </>
  );
}
