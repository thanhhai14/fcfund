"use client";

import { useActionState } from "react";
import { loginAction, type LoginState } from "./actions";

const initialState: LoginState = {};

export function LoginForm() {
  const [state, action, pending] = useActionState(loginAction, initialState);

  return (
    <form action={action} className="login-form">
      <label>
        Số điện thoại
        <input
          name="phone"
          type="tel"
          inputMode="numeric"
          pattern="[0-9]*"
          autoComplete="tel"
          placeholder="0901 234 567"
          required
          onInput={(event) => {
            event.currentTarget.value = event.currentTarget.value.replace(/\D/g, "");
          }}
        />
      </label>
      <label>
        Mật khẩu
        <input
          name="password"
          type="password"
          autoComplete="current-password"
          placeholder="Nhập mật khẩu"
          required
        />
      </label>
      {state.error && <p className="form-error" role="alert">{state.error}</p>}
      <button className="button primary wide submit-button" disabled={pending} aria-busy={pending}>
        {pending && <span className="button-spinner" aria-hidden="true" />}
        <span>{pending ? "Đang đăng nhập..." : "Đăng nhập"}</span>
      </button>
      <p className="login-help">Quên mật khẩu? Liên hệ Admin của đội để được đặt lại.</p>
    </form>
  );
}
