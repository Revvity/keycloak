import type GroupRepresentation from "@keycloak/keycloak-admin-client/lib/defs/groupRepresentation";
import type RealmRepresentation from "@keycloak/keycloak-admin-client/lib/defs/realmRepresentation";
import type UserRepresentation from "@keycloak/keycloak-admin-client/lib/defs/userRepresentation";
import {
  ActionGroup,
  AlertVariant,
  Button,
  Checkbox,
  FormGroup,
  Switch,
} from "@patternfly/react-core";
import { useState } from "react";
import { Controller, useFormContext } from "react-hook-form";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router-dom";

import { useAlerts } from "../components/alert/Alerts";
import { FormAccess } from "../components/form-access/FormAccess";
import { HelpItem } from "ui-shared";
import { KeycloakTextInput } from "../components/keycloak-text-input/KeycloakTextInput";
import { useAdminClient, useFetch } from "../context/auth/AdminClient";
import { useRealm } from "../context/realm-context/RealmContext";
import { emailRegexPattern } from "../util";
import useFormatDate from "../utils/useFormatDate";
import useIsFeatureEnabled, { Feature } from "../utils/useIsFeatureEnabled";
import { FederatedUserLink } from "./FederatedUserLink";
import { UserProfileFields } from "./UserProfileFields";
import { PasswordInput } from "../components/password-input/PasswordInput";

export type BruteForced = {
  isBruteForceProtected?: boolean;
  isLocked?: boolean;
};

export interface UserFormSaveResponse extends UserRepresentation {
  temporaryPassword: string;
  isAdmin: boolean;
}

export type UserFormProps = {
  user?: UserRepresentation;
  bruteForce?: BruteForced;
  save: (user: UserFormSaveResponse) => void;
  onGroupsUpdate?: (groups: GroupRepresentation[]) => void;
  isServiceUser?: boolean;
};

export const UserForm = ({
  user,
  bruteForce: { isBruteForceProtected, isLocked } = {
    isBruteForceProtected: false,
    isLocked: false,
  },
  save,
  isServiceUser = false,
}: UserFormProps) => {
  const { t } = useTranslation("users");
  const { realm: realmName } = useRealm();
  const formatDate = useFormatDate();
  const isFeatureEnabled = useIsFeatureEnabled();

  const navigate = useNavigate();
  const { adminClient } = useAdminClient();
  const { addAlert, addError } = useAlerts();

  const {
    handleSubmit,
    register,
    watch,
    reset,
    control,
    formState: { errors },
  } = useFormContext<UserFormSaveResponse>();
  const watchUsernameInput = watch("username");

  const [locked, setLocked] = useState(isLocked);
  const [realm, setRealm] = useState<RealmRepresentation>();

  useFetch(
    () => adminClient.realms.findOne({ realm: realmName }),
    (realm) => {
      if (!realm) {
        throw new Error(t("common:notFound"));
      }
      setRealm(realm);
    },
    []
  );

  const unLockUser = async () => {
    try {
      await adminClient.attackDetection.del({ id: user!.id! });
      addAlert(t("unlockSuccess"), AlertVariant.success);
    } catch (error) {
      addError("users:unlockError", error);
    }
  };

  const isUserProfileEnabled =
    isFeatureEnabled(Feature.DeclarativeUserProfile) &&
    realm?.attributes?.userProfileEnabled === "true";

  return (
    <FormAccess
      onSubmit={handleSubmit(save)}
      role="query-users"
      fineGrainedAccess={user?.access?.manage}
      className="pf-u-mt-lg"
      isReadOnly={isServiceUser}
    >
      {user?.id && (
        <>
          <FormGroup label={t("common:id")} fieldId="kc-id" isRequired>
            <KeycloakTextInput
              id={user.id}
              aria-label={t("userID")}
              value={user.id}
              type="text"
              isReadOnly
            />
          </FormGroup>
          <FormGroup label={t("createdAt")} fieldId="kc-created-at" isRequired>
            <KeycloakTextInput
              value={formatDate(new Date(user.createdTimestamp!))}
              type="text"
              id="kc-created-at"
              aria-label={t("createdAt")}
              name="createdTimestamp"
              isReadOnly
            />
          </FormGroup>
        </>
      )}
      {(user?.federationLink || user?.origin) && (
        <FormGroup
          label={t("federationLink")}
          labelIcon={
            <HelpItem
              helpText={t("users-help:federationLink")}
              fieldLabelId="users:federationLink"
            />
          }
        >
          <FederatedUserLink user={user} />
        </FormGroup>
      )}
      {isUserProfileEnabled ? (
        <UserProfileFields />
      ) : (
        <>
          {!realm?.registrationEmailAsUsername && (
            <FormGroup
              label={t("username")}
              fieldId="kc-username"
              isRequired
              validated={errors.username ? "error" : "default"}
              helperTextInvalid={
                errors.username?.type === "pattern"
                  ? "Service User Already Exists"
                  : t("common:required")
              }
            >
              <KeycloakTextInput
                id="kc-username"
                isReadOnly={
                  !!user?.id &&
                  !realm?.editUsernameAllowed &&
                  realm?.editUsernameAllowed !== undefined
                }
                {...register("username", { pattern: /^(?!service$).*$/i })}
              />
            </FormGroup>
          )}
          <FormGroup
            label={t("email")}
            fieldId="kc-email"
            validated={errors.email ? "error" : "default"}
            helperTextInvalid={t("users:emailInvalid")}
          >
            <KeycloakTextInput
              type="email"
              id="kc-email"
              data-testid="email-input"
              {...register("email", {
                pattern: emailRegexPattern,
              })}
            />
          </FormGroup>
          <FormGroup
            label={t("firstName")}
            fieldId="kc-firstName"
            validated={errors.firstName ? "error" : "default"}
            helperTextInvalid={t("common:required")}
          >
            <KeycloakTextInput
              data-testid="firstName-input"
              id="kc-firstName"
              {...register("firstName")}
            />
          </FormGroup>
          <FormGroup
            label={t("lastName")}
            fieldId="kc-lastName"
            validated={errors.lastName ? "error" : "default"}
          >
            <KeycloakTextInput
              data-testid="lastName-input"
              id="kc-lastname"
              aria-label={t("lastName")}
              {...register("lastName")}
            />
          </FormGroup>
          {!user?.id && (
            <>
              <FormGroup
                label={"Temporary Password"}
                fieldId="kc-temporaryPassword"
                validated={errors.temporaryPassword ? "error" : "default"}
              >
                <PasswordInput
                  data-testid="temporaryPasswordField"
                  id="kc-temporaryPassword"
                  {...register("temporaryPassword", { required: true })}
                />
              </FormGroup>
              <Controller
                name="isAdmin"
                control={control}
                defaultValue={false}
                render={({ field }) => (
                  <Checkbox
                    id="kc-is-admin"
                    data-testid="is-admin"
                    label={"Is Administrator?"}
                    isChecked={field.value === true}
                    onChange={(value) => field.onChange(value)}
                  />
                )}
              />
            </>
          )}
        </>
      )}
      {isBruteForceProtected && (
        <FormGroup
          label={t("temporaryLocked")}
          fieldId="temporaryLocked"
          labelIcon={
            <HelpItem
              helpText={t("users-help:temporaryLocked")}
              fieldLabelId="users:temporaryLocked"
            />
          }
        >
          <Switch
            data-testid="user-locked-switch"
            id="temporaryLocked"
            onChange={(value) => {
              unLockUser();
              setLocked(value);
            }}
            isChecked={locked}
            isDisabled={!locked}
            label={t("common:on")}
            labelOff={t("common:off")}
          />
        </FormGroup>
      )}
      {!isServiceUser && (
        <ActionGroup>
          <Button
            data-testid={!user?.id ? "create-user" : "save-user"}
            isDisabled={
              !user?.id &&
              !watchUsernameInput &&
              !realm?.registrationEmailAsUsername
            }
            variant="primary"
            type="submit"
          >
            {user?.id ? t("common:save") : t("common:create")}
          </Button>
          <Button
            data-testid="cancel-create-user"
            onClick={() =>
              user?.id ? reset(user) : navigate(`/${realmName}/users`)
            }
            variant="link"
          >
            {user?.id ? t("common:revert") : t("common:cancel")}
          </Button>
        </ActionGroup>
      )}
    </FormAccess>
  );
};
