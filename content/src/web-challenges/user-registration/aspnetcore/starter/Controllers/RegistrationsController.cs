using RegistrationApi.Models;
using RegistrationApi.Services;
using Microsoft.AspNetCore.Mvc;

namespace RegistrationApi.Controllers;

[ApiController]
[Route("api/registrations")]
public class RegistrationsController(RegistrationService registrations) : ControllerBase
{
    // GET /api/registrations/{id}
    [HttpGet("{id:int}")]
    public ActionResult<RegistrationResponse> GetById(int id) =>
        registrations.Find(id) is { } account ? RegistrationResponse.From(account) : NotFound();

    // TODO: POST /api/registrations: 201 with a Location header and the new account
    // (id, email, displayName: never the password), 400 with
    // { "errors": { field: [messages] } } listing every invalid field,
    // 409 when the email address is already registered.
}
